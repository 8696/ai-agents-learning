/**
 * 职责：某一版 Prompt 写一次协议 A，并算出长度 / 推理标记 / preview。
 * 数据流：{ llm, mode, text, promptSuffix } → chat.completions.create → CompareRow。
 * ① User = promptSuffix + "\n\n问题：" + text，两版只换 suffix。
 * ② temperature 固定 0：本条比的是 Prompt 文本，不是采样随机性。
 *
 * 日志（§5.3.16）：调用函数 五条日志（runOne 封装层），调用模型 五条日志（真正发网络请求的那一层，含 __code + 字段释义）。
 */
import type { Llm } from "../../../../llm.js";
import { SYSTEM_PROMPT } from "../version/presets.js";
import type { Mode } from "../version/presets.js";
import { detectReasoning, previewLine } from "../version/detect.js";
import { logger } from "../logger.js";

export type CompareOk = {
  mode: Mode;
  ok: true;
  raw: string;
  textLen: number;
  hasReasoning: boolean;
  preview: string;
};

export type CompareFail = {
  mode: Mode;
  ok: false;
  status: number;
  error: string;
};

export type CompareRow = CompareOk | CompareFail;

function httpErrorMessage(error: unknown): { status: number; message: string } {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    const message =
      error instanceof Error
        ? error.message
        : String((error as { message?: unknown }).message ?? error);
    return {
      status: typeof status === "number" ? status : 502,
      message,
    };
  }
  if (error instanceof Error) {
    return { status: 502, message: error.message };
  }
  return { status: 502, message: String(error) };
}

export async function runOne(input: {
  llm: Llm;
  mode: Mode;
  text: string;
  promptSuffix: string;
}): Promise<CompareRow> {
  const tFuncStart = Date.now();
  // ── 协议 A request 拼装 + 入口打点 ──
  // 协议 A 走 input.llm.openai.chat.completions.create；这里把 messages / temperature / max_tokens
  // 拼成单一 request 便于下面 __code 整块打，也能直接复用给 mock 或回放。
  const request = {
    model: input.llm.modelA,
    temperature: 0,
    max_tokens: 500,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `${input.promptSuffix}\n\n问题：${input.text}`,
      },
    ],
  };

  logger.info(
    "│ 单版-runOne",
    "调用函数开始：runOne",
    "为什么写这条日志：compareVersions 只认这一层返回的 CompareRow；里面那次才是真发网络请求（看「调用模型开始：协议A-对话补全」）。当前：即将按 mode 拼 messages；同一题只换 promptSuffix。",
    {
      入参: { mode: input.mode, promptSuffixPreview: input.promptSuffix.slice(0, 60), promptSuffixLen: input.promptSuffix.length, textLen: input.text.length },
      __code: `const request = { model: input.llm.modelA, temperature: 0, max_tokens: 500, messages: [...] };\nconst completion = await input.llm.openai.chat.completions.create(request);`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    `为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 choices[0].message.content / usage。当前：即将发出请求；mode 决定 suffix；temperature=0 排除采样随机性只比「Prompt 文本」。`,
    {
      入参: {
        mode: input.mode,
        model: request.model,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        messagesCount: request.messages.length,
        systemPrompt: SYSTEM_PROMPT,
        promptSuffix: input.promptSuffix,
        textLen: input.text.length,
      },
      __code: `await input.llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const completion = await input.llm.openai.chat.completions.create(request);
    logger.info(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全",
      "为什么写这条日志：要拿 choices[0].message.content / usage（计费依据），下游还要 detectReasoning + previewLine。当前：await 已返回。",
      {
        返回值: {
          id: completion.id,
          model: completion.model,
          finishReason: completion.choices?.[0]?.finish_reason,
          usage: completion.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "choices[0].finish_reason": "stop=正常 / length=撞 max_tokens / content_filter=策略拦下",
          usage: "OpenAI 标准 usage 三字段（计费依据）",
        },
      },
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    const row: CompareRow = {
      mode: input.mode,
      ok: true,
      raw,
      textLen: raw.length,
      hasReasoning: detectReasoning(raw),
      preview: previewLine(raw),
    };
    logger.info(
      "│ 单版-runOne",
      "调用函数结束：runOne",
      "为什么写这条日志：compareVersions 要把 CompareRow 收齐后并排对照；打 preview / hasReasoning 一眼看出 v1 vs v2 的差异。当前：detectReasoning + previewLine 已算。",
      {
        返回值: {
          mode: input.mode,
          ok: true,
          textLen: row.textLen,
          hasReasoning: row.hasReasoning,
          preview: row.preview,
        },
        耗时ms: Date.now() - tFuncStart,
        字段释义: {
          hasReasoning: "raw 里是否带了 <think>...</think> 标记",
          preview: "raw 的首行（页面 cards 用）",
        },
      },
    );
    return row;
  } catch (error: unknown) {
    const mapped = httpErrorMessage(error);
    logger.error(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全（失败）",
      "为什么写这条日志：拿到 mappedStatus 才能区分 401/403（Key）、429（限流）、5xx；未识别 → 502。当前：create 抛错，compareVersions 的 Promise.all 会兜住另一版。",
      {
        返回值: { mappedStatus: mapped.status, message: mapped.message },
        耗时ms: Date.now() - tModelStart,
        错误: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      },
    );
    logger.error(
      "│ 单版-runOne",
      "调用函数结束：runOne（失败）",
      "为什么写这条日志：失败也要按 CompareRow 形状回收，便于 compareVersions 并排展示；记 mode 便于看是不是单版本问题。当前：模型抛错，已转 CompareFail。",
      {
        返回值: { mode: input.mode, ok: false, status: mapped.status, error: mapped.message },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { mode: input.mode, ok: false, status: mapped.status, error: mapped.message };
  }
}