/**
 * 职责：精排（Rerank）。只给「已经上桌」的切块，把问句和正文拼成一对，让模型打相关分。
 * 本步核心：第二阶段改顺序，不再扫整库。
 * 数据流：问句 + 候选 id[] → 按 id 取正文 → 调一次对话补全 → 按精排分重排。
 * 为什么单独成文件：两阶段里真正改顺序的是这一跳；路由只校验入参。
 */
import { getLlmOptional } from "../../../../llm.js";
import { getChunkById, type KnowledgeChunk } from "../corpus/knowledge-base.js";
import { logger } from "../logger.js";
import { HttpError } from "../http/send-error.js";

export type RerankMode = "on" | "off";

export type RerankRow = {
  chunk: KnowledgeChunk;
  recallRank: number;
  rerankRank: number;
  rerankScore: number;
  reason: string;
};

export type RerankResult = {
  query: string;
  rows: RerankRow[];
  model: string | null;
  mode: RerankMode;
};

type ModelScore = {
  chunkId: string;
  score: number;
  reason: string;
};

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("模型没有返回可解析的 JSON");
  }
}

function parseScores(text: string, ids: string[]): ModelScore[] {
  const raw = extractJsonObject(text) as { scores?: unknown };
  if (!Array.isArray(raw.scores)) {
    throw new HttpError(502, "精排结果缺 scores 数组", "模型返回值对不上约定形状");
  }
  const byId = new Map<string, ModelScore>();
  for (const item of raw.scores) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { chunkId?: unknown; score?: unknown; reason?: unknown };
    if (typeof rec.chunkId !== "string") continue;
    const score = typeof rec.score === "number" ? rec.score : Number(rec.score);
    if (!Number.isFinite(score)) continue;
    byId.set(rec.chunkId, {
      chunkId: rec.chunkId,
      score,
      reason: typeof rec.reason === "string" ? rec.reason : "",
    });
  }
  return ids.map((id) => {
    const hit = byId.get(id);
    return hit ?? { chunkId: id, score: 0, reason: "模型没给这条分数，按 0 处理" };
  });
}

/**
 * 关闭精排：召回前 K 条直接当生成材料。rerankScore 用 coarseScore 顶替，
 * rerankRank = recallRank，让「名次变化」这一列直接显示「没变化」。
 * 这一步不调 LLM —— 教学点正是「精排不是默认必开」。
 */
function rerankOff(
  chunks: KnowledgeChunk[],
  recallRankById: Record<string, number>,
  coarseScoreById: Record<string, number>,
): RerankRow[] {
  const rows: RerankRow[] = chunks.map((chunk) => ({
    chunk,
    recallRank: recallRankById[chunk.id] ?? 0,
    rerankRank: recallRankById[chunk.id] ?? 0,
    rerankScore: coarseScoreById[chunk.id] ?? 0,
    reason: "已关闭精排：召回顺序就是最终顺序，分数沿用粗召回分（coarseScore）",
  }));
  rows.sort((a, b) => a.rerankRank - b.rerankRank);
  return rows;
}

export async function rerankCandidates(
  query: string,
  candidateIds: string[],
  recallRankById: Record<string, number>,
  coarseScoreById: Record<string, number>,
  mode: RerankMode = "on",
): Promise<RerankResult> {
  const t0 = Date.now();
  const chunks: KnowledgeChunk[] = [];
  for (const id of candidateIds) {
    const chunk = getChunkById(id);
    if (!chunk) {
      throw new HttpError(400, `候选里有库中不存在的切块：${id}`, "精排只能打桌上的切块，不能凭空造一条");
    }
    chunks.push(chunk);
  }

  logger.info(
    "调用函数-rerankCandidates",
    "调用函数开始：rerankCandidates",
    "为什么写这条日志：第二阶段只给桌上的切块打分，不再扫整库。当前：即将拼提示词，里面那次才是真发网络请求。",
    {
      入参: { query, candidateIds, recallRankById, mode },
      __code: "const response = await llm.openai.chat.completions.create(request); 再按 score 重排",
    },
  );

  // ── 关闭精排：不调模型，直接拿召回前 K ──
  if (mode === "off") {
    const rows = rerankOff(chunks, recallRankById, coarseScoreById);
    const result: RerankResult = {
      query,
      rows,
      model: null,
      mode: "off",
    };
    logger.info(
      "调用函数-rerankCandidates",
      "调用函数结束：rerankCandidates",
      "为什么写这条日志：关闭精排就退化成召回前 K 直接给生成。当前：不再发模型请求。",
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );
    return result;
  }

  // ── 打开精排：调模型逐条打分 ──
  const llm = getLlmOptional();
  if (!llm) {
    throw new HttpError(503, "未配置模型密钥", "精排打开需要 LLM 密钥，请检查 apps/.env");
  }
  const payload = chunks.map((chunk) => ({
    chunkId: chunk.id,
    title: chunk.title,
    text: chunk.text,
  }));
  const request = {
    model: llm.modelA,
    temperature: 0,
    messages: [
      {
        role: "system" as const,
        content:
          "你是检索精排器。只判断「这一句问话」和「这一段切块」有多相关。不要回答用户问题。只输出 JSON。",
      },
      {
        role: "user" as const,
        content: [
          `问句：${query}`,
          "对下面每一个切块打 0 到 1 的相关分。要看见问句里的约束（例如没拆、超过时限），不要只看见「退 / 天」。",
          "输出形状：{\"scores\":[{\"chunkId\":\"...\",\"score\":0.0,\"reason\":\"一句话\"}]}",
          JSON.stringify(payload),
        ].join("\n"),
      },
    ],
  };

  logger.info(
    "│ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：这是真发网络请求的那一次，没有它就没有精排分。当前：在 rerankCandidates 里，候选已经上桌。",
    {
      入参: request,
      __code: "const response = await llm.openai.chat.completions.create(request);",
    },
  );

  const tModel = Date.now();
  let response;
  try {
    response = await llm.openai.chat.completions.create(request);
  } catch (error: unknown) {
    logger.error(
      "│ 调用模型-对话补全",
      "调用模型结束：对话补全（失败）",
      "为什么写这条日志：模型调用失败要原样留下。当前：精排还没有分数。",
      { 返回值: error, 耗时ms: Date.now() - tModel },
    );
    logger.error(
      "调用函数-rerankCandidates",
      "调用函数结束：rerankCandidates（失败）",
      "为什么写这条日志：外层也要收口。当前：页面应看到失败，而不是假名单。",
      { 返回值: error, 耗时ms: Date.now() - t0 },
    );
    throw error;
  }

  const content = response.choices[0]?.message?.content ?? "";
  logger.info(
    "│ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要用返回的 JSON 给每条切块一个精排分。当前：await 已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: {
        "choices[0].message.content": "模型给出的 JSON 文本，里面是每条切块的相关分",
      },
    },
  );

  const scores = parseScores(content, candidateIds);
  const merged = chunks.map((chunk) => {
    const scored = scores.find((item) => item.chunkId === chunk.id);
    return {
      chunk,
      recallRank: recallRankById[chunk.id] ?? 0,
      rerankScore: scored?.score ?? 0,
      reason: scored?.reason ?? "",
    };
  });
  merged.sort((a, b) => b.rerankScore - a.rerankScore || a.recallRank - b.recallRank);

  const result: RerankResult = {
    query,
    model: llm.modelA,
    rows: merged.map((item, index) => ({
      ...item,
      rerankRank: index + 1,
    })),
    mode: "on",
  };

  logger.info(
    "调用函数-rerankCandidates",
    "调用函数结束：rerankCandidates",
    "为什么写这条日志：新顺序已经排好，生成阶段只会看见最前面几条。当前：同一条切块的召回名次和精排名次可以对照。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}
