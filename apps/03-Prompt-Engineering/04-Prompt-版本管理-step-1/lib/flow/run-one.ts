/**
 * 职责：某一版 Prompt 打一次协议 A，并算出长度 / 推理标记 / preview。
 * 数据流：{ llm, mode, text, promptSuffix } → chat.completions.create → CompareRow。
 * ① User = promptSuffix + "\\n\\n问题：" + text，两版只换 suffix。
 * ② temperature 固定 0：本条比的是 Prompt 文本，不是采样随机性。
 *
 * 日志（§5.3.16）：每个版本号（v1/v2）每次调 LLM 都打 —— llm.request / llm.response / llm.error；
 *   mode 写进 data 便于日志里区分哪一版跑的。
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
    "llm.request",
    `→ [${input.mode}] openai.chat.completions.create`,
    `单版（${input.mode}）调协议 A 发起 chat；记 mode + promptSuffix 便于日志里区分是哪一版跑的，__code 整块打便于核对 messages 拼装是否对（同一题只换 suffix）`,
    {
      mode: input.mode,
      model: request.model,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      messagesCount: request.messages.length,
      systemPrompt: SYSTEM_PROMPT,
      promptSuffix: input.promptSuffix,
      textLen: input.text.length,
      __code: `await input.llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const completion = await input.llm.openai.chat.completions.create(request);
    logger.info(
      "llm.response",
      `← [${input.mode}] got response`,
      `单版（${input.mode}）协议 A 返回；完整打响应便于核对 SDK 自带字段（id / choices / usage / model），也是比对两版输出差异的原始证据`,
      completion,
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    return {
      mode: input.mode,
      ok: true,
      raw,
      textLen: raw.length,
      hasReasoning: detectReasoning(raw),
      preview: previewLine(raw),
    };
  } catch (error: unknown) {
    const mapped = httpErrorMessage(error);
    logger.error(
      "llm.error",
      `[${input.mode}] openai.chat.completions.create threw`,
      `单版（${input.mode}）协议 A 抛异常（网络 / 5xx / 4xx）；记 status + 错误信息便于排错（另一版可能成功，便于看是不是单版本问题）`,
      { mode: input.mode, status: mapped.status, error: mapped.message },
    );
    return { mode: input.mode, ok: false, status: mapped.status, error: mapped.message };
  }
}
