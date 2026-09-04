/**
 * 职责：协议 A 一次性调用 —— 只用 openai SDK，system 放进 messages[]。
 * 数据流：system + turns → chat.completions.create(stream:false) → CallResult。
 * 本文件禁止 import @anthropic-ai/sdk。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { CallResult, Role, Turn } from "../flow/types.js";
import { logger } from "../logger.js";

export async function sendViaA(
  llm: Llm,
  system: string | null,
  turns: Turn[],
): Promise<CallResult> {
  const t0 = performance.now();
  const messages: Array<{ role: Role; content: string }> = [];
  // ① A 没有顶层 system 字段，只能作为 messages 的第一条；不塞就等于没约束
  if (system) messages.push({ role: "system", content: system });
  messages.push(...turns);

  const reqBody = {
    model: llm.modelA,
    messages,
    stream: false,
  };
  logger.info(
    "llm.request.protocolA",
    "→ openai.chat.completions.create",
    "协议 A 调起 openai chat.completions；system 只能放在 messages[0] 是 A 的硬约束 —— 把整段 messages 打进 __code 才能事后核对「System 在哪条 / User 在哪条 / role 顺序是否对了」",
    {
      provider: "openai",
      model: llm.modelA,
      messagesCount: messages.length,
      systemInMessages: Boolean(system),
      roleOrder: messages.map((m) => m.role),
      __code: JSON.stringify(reqBody, null, 2),
    },
  );

  const r = await llm.openai.chat.completions.create(reqBody);
  logger.info(
    "llm.response.protocolA",
    "← got response",
    "完整打响应便于核对 SDK 自带字段（choices[0].message.content / usage / model / id 等）",
    r,
  );
  const t1 = performance.now();
  // SDK 对象不一定可枚举，摊成 plain JSON 再读，避免 usage 读到 undefined
  const plain = JSON.parse(JSON.stringify(r)) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: plain.choices?.[0]?.message?.content ?? "",
    usage: {
      input: plain.usage?.prompt_tokens ?? 0,
      output: plain.usage?.completion_tokens ?? 0,
    },
    durationMs: Math.round(t1 - t0),
  };
}
