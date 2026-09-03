/**
 * 职责：POST /api/stream 的入参闸门（Zod + 最后一轮必须是 user + 该家有 Key）。
 * 数据流：ctx.request.body → StreamBody；失败则已写 status/body，返回 null。
 * 为什么：route 只做分叉，校验口径必须两家共用，否则 A 过、B 不过会让对照失真。
 */
import type { Context } from "koa";
import { z } from "zod";
import {
  getLlmForProvider,
  PRODUCTION_PROVIDER_IDS,
  type Llm,
  type ProductionProviderId,
} from "../../../../llm.js";
import type { ChatTurn, StreamBody } from "../compare/stream-types.js";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  thinking: z.string().optional(),
});

const bodySchema = z.object({
  provider: z.enum(PRODUCTION_PROVIDER_IDS),
  protocol: z.enum(["A", "B"]),
  thinking_on: z.boolean().default(true),
  reasoning_split: z.boolean().default(true),
  message: z.string().optional(),
  system: z.string().optional(),
  messages: z.array(turnSchema).optional(),
});

function resolveMessages(parsed: z.infer<typeof bodySchema>): ChatTurn[] | null {
  if (parsed.messages && parsed.messages.length > 0) {
    return parsed.messages;
  }
  const one = parsed.message?.trim() ?? "";
  if (!one) return null;
  return [{ role: "user", content: one }];
}

/** body 不合法 / 没有 user 收尾 → 400。通过则返回规范化后的 StreamBody。 */
export function parseStreamBody(ctx: Context): StreamBody | null {
  const parsed = bodySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: `请求体不合法: ${parsed.error.message}` };
    return null;
  }
  const messages = resolveMessages(parsed.data);
  if (!messages || messages[messages.length - 1]?.role !== "user") {
    ctx.status = 400;
    ctx.body = {
      error: "请求体不合法: 需要至少一条 user 消息，且最后一轮必须是 user（才能追问）",
    };
    return null;
  }
  return {
    provider: parsed.data.provider,
    protocol: parsed.data.protocol,
    thinkingOn: parsed.data.thinking_on,
    reasoningSplit: parsed.data.reasoning_split,
    system: parsed.data.system?.trim() || "你是严谨的助手。先想清楚，再给结论。",
    messages,
  };
}

/** 该家没 Key / 没模型 id → 400。比等 SDK 抛错更早告诉人该查哪一组 env。 */
export function requireProviderLlm(
  ctx: Context,
  provider: ProductionProviderId,
): Llm | null {
  const llm = getLlmForProvider(provider);
  if (!llm) {
    ctx.status = 400;
    ctx.body = {
      error: `提供商 ${provider} 没有 Key 或模型 id，请检查 apps/.env 对应分组`,
    };
    return null;
  }
  return llm;
}
