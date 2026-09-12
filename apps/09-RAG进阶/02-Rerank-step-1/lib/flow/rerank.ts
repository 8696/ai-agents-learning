/**
 * 本步核心：精排（Rerank）—— 对粗召回后的候选 N 条，
 *           用真调大模型按"问句 + 这篇文档"成对打分（点式 Pointwise），
 *           按精排分重排，决定最终喂给生成的顺序。
 *
 * 职责：
 *   - scoreAndRerank：拿粗召回 N 条 + query → 调一次大模型批量出 N 个相关分
 *     → 按精排分降序重排 → 返回精排榜
 *
 * 数据流：
 *   输入 { query, candidates } → 拼 prompt（query + 每条编号候选）→
 *   llm.openai.chat.completions.create → parse JSON 数组（每篇 0~1 分）→
 *   按分降序排序 → 截 → 返回 ranked[] + rawScores
 *
 * 为什么单独成文件：本条教学点 = "第二阶段读了问句和正文之后名次会变"。
 * 学习者打开这一个文件就能把"精排怎么打分 + 怎么重排"读完。
 * route 只校验入参 → 调本文件 → 写 ctx.body。
 *
 * 为什么是真发网络请求：交叉编码器 / 专用精排 API / 大模型逐条打分，三选一。
 * 本 demo 选第三种（用现有对话模型）—— 教学便宜，可演示名次跳动；禁止写死分数冒充精排。
 */
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import { withCall } from "../http/with-call.js";
import { HttpError } from "../http/send-error.js";
import type { RrfRow } from "./recall.js";

export type RerankInput = {
  /** 用户原始问句 —— 精排不改问句字符串（与查询改写无关） */
  query: string;
  /** 粗召回后的候选（一般是 RRF 榜） */
  candidates: RrfRow[];
};

export type RerankRow = {
  cardId: string;
  text: string;
  /** 精排分：0~1，越大越相关 —— 与粗召回的余弦/BM25 不同尺子，不直接相加 */
  rerankScore: number;
  /** 精排后的最终名次（1-based） */
  rank: number;
  /** 在粗召回（RRF）里原本第几 —— 名次跳动一目了然 */
  previousRank: number;
  /** 1-based 的粗召回原 rank（融合榜） */
  rawRank: number;
  rrfScore: number;
};

export type RerankResult = {
  query: string;
  /** 真正调模型的那一次拿到的原始分数组（按输入顺序） */
  rawScores: number[];
  /** 精排后的最终榜 —— 最终喂给生成（Generate）只看这一份 */
  rows: RerankRow[];
  /** 总耗时（含模型调用） */
  elapsedMs: number;
};

/** 拼提示词：让模型按 `{"scores":[...]}` 形态回 N 个 0~1 分（JSON 对象，最稳） */
function buildPrompt(query: string, candidates: RrfRow[]): {
  system: string;
  user: string;
} {
  const system = [
    "你是一个相关性打分助手。给定一个用户问题和一个文档列表，请按 0 到 1 给每篇打分。",
    "分数 = 文档能否真正回答这个问题；只看内容是否对得上，不被\"字面很像但答的不是这件事\"骗到。",
    "返回必须是合法 JSON 对象，键名固定为 scores；scores 是 N 个 0~1 数字的数组，N 严格等于候选条数。",
    "不要任何解释、不要 Markdown 代码块、不要任何多余文字。",
    "返回格式示例：{\"scores\":[0.82,0.15,0.61,...]}",
  ].join("\n");

  const numbered = candidates.map((c, i) =>
    `[${i + 1}] (id=${c.cardId})\n${c.text}`,
  ).join("\n\n");

  const user = `用户问题：${query}\n\n文档列表（共 ${candidates.length} 条）：\n${numbered}\n\n请返回 {"scores":[...]}（${candidates.length} 个数字）：`;

  return { system, user };
}

/** 把模型返回的 content 字符串抽出 {"scores":[...]} —— 多种形态都尝试 */
function parseScoreArray(content: string, expectedLen: number): number[] {
  const stripped = content
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // ① 直接整段 JSON.parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // ② 找第一个 { 到最后一个 }，再 parse（模型偶有前后多余文字）
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      throw new HttpError(
        502,
        "模型返回里找不到 JSON 对象",
        `原文前 500 字：${content.slice(0, 500)}`,
      );
    }
    try {
      parsed = JSON.parse(stripped.slice(first, last + 1));
    } catch (err) {
      throw new HttpError(
        502,
        "模型返回的 JSON 解析失败",
        `原文前 500 字：${content.slice(0, 500)}`,
      );
    }
  }

  // ③ 取出 scores 字段（多种别名）
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(
      502,
      "模型返回不是 JSON 对象",
      `原文前 500 字：${content.slice(0, 500)}`,
    );
  }
  const obj = parsed as Record<string, unknown>;
  const candidate = obj.scores ?? obj.score ?? obj.rerank ?? obj.results;
  if (!Array.isArray(candidate)) {
    throw new HttpError(
      502,
      "模型返回里 scores 不是数组（key 应当是 scores）",
      `原文前 500 字：${content.slice(0, 500)}`,
    );
  }

  // ④ 转数字 + 夹到 [0, 1] + 长度校验
  const scores = candidate.map((v, i) => {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      throw new HttpError(502, `第 ${i + 1} 个分数不是数字`, `值：${String(v)}`);
    }
    return Math.max(0, Math.min(1, n));
  });
  if (scores.length !== expectedLen) {
    throw new HttpError(
      502,
      `模型返回 ${scores.length} 个分数，期望 ${expectedLen}`,
      "prompt 里明确写了条数；看一下是不是被截断，或者模型没数对候选",
    );
  }
  return scores;
}

const inputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  candidates: z.array(z.unknown()).min(1, "候选不能为空"),
});

export async function scoreAndRerank(input: RerankInput): Promise<RerankResult> {
  // 校验
  const parsed = inputSchema.parse({
    query: input.query,
    candidates: input.candidates,
  });
  const query = parsed.query;
  const candidates = parsed.candidates as RrfRow[];

  if (!query.trim()) {
    throw new HttpError(400, "query 是空的", "输入框写一句再点精排");
  }
  if (candidates.length === 0) {
    throw new HttpError(400, "候选列表为空", "先跑粗召回，再送进精排");
  }

  const t0 = Date.now();
  const { system, user } = buildPrompt(query, candidates);

  return await withCall({
    scope: " 调用函数-scoreAndRerank",
    kind: "函数",
    name: "scoreAndRerank（精排打分 + 重排）",
    explain:
      "为什么写这条日志：本步核心 = 精排。里面那次是真发网络请求的对话模型调用（看「调用模型开始」）。当前：候选 N 条已准备好，准备拼 prompt 让模型对每条出 0~1 分。",
    args: { query, candidateCount: candidates.length, candidateIds: candidates.map((c) => c.cardId) },
    code: "scoreAndRerank({ query, candidates })",
    run: async () => {
      const llm = getLlm();

      // 真发网络请求 —— 一次拿 N 个分（点式批量）。N 大时仍只 1 次调用
      const response = await withCall({
        scope: "│ 调用模型-精排打分",
        kind: "模型",
        name: "chat.completions.create（点式打分 · 批量）",
        explain:
          "为什么写这条日志：本步真发网络请求。点式（Pointwise）打分：把 N 对「问句+文档」一次塞给模型，让它按顺序给每个 0~1 分。当前：精排 prompt 已拼好，调模型拿 JSON 数组。",
        args: { system, user, model: llm.modelA, candidateCount: candidates.length },
        code: "llm.openai.chat.completions.create({ model: llm.modelA, messages, response_format: { type: 'json_object' } })",
        run: async () => {
          // 用 json_object 模式只是方便，但 prompt 里要的是数组。这里手动包一层
          const reqMessages = [
            { role: "system" as const, content: system },
            { role: "user" as const, content: user },
          ];
          return await llm.openai.chat.completions.create({
            model: llm.modelA,
            messages: reqMessages,
            temperature: 0,
            // 强制 JSON 对象输出，prompt 里要 scores 字段包数组；模型不会被它自己的 markdown 包裹干扰
            response_format: { type: "json_object" },
          });
        },
      });

      const content = response.choices?.[0]?.message?.content ?? "";
      const rawScores = parseScoreArray(content, candidates.length);

      // 按精排分降序排 + 赋 rank + 记 previousRank
      const rows = candidates.map<RerankRow>((c, i) => ({
        cardId: c.cardId,
        text: c.text,
        rerankScore: rawScores[i]!,
        rank: 0,
        previousRank: i + 1,
        rawRank: i + 1,
        rrfScore: c.rrfScore,
      }));
      rows.sort((a, b) => b.rerankScore - a.rerankScore);
      rows.forEach((r, idx) => {
        r.rank = idx + 1;
      });

      return {
        query,
        rawScores,
        rows,
        elapsedMs: Date.now() - t0,
      };
    },
  });
}