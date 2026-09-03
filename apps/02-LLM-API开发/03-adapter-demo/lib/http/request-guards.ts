/**
 * 职责：入参闸门 —— 有没有 Key、body 能不能翻成 SendMessageOptions。
 * 数据流：koa ctx → 通过则返回 opts；不通过时已写 status/body，返回 null。
 */
import type { Context } from "koa";
import { z } from "zod";
import type { Llm } from "../../../../llm.js";
import { llm } from "./runtime-ctx.js";
import type { SendMessageOptions } from "../adapter/types.js";

const bodySchema = z.object({
  message: z.string().min(1, "message 不能为空"),
  protocol: z.enum(["A", "B"]),
  system: z.string().optional(),
  enable_thinking: z.boolean().default(true),
  thinking_budget: z.number().int().positive().default(1024),
});

export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error: "当前 LLM_PROVIDER 没有 Key，adapter 无法选 SDK。",
      hint: "在 apps/.env 填对应 {PROVIDER}_API_KEY。",
    };
    return null;
  }
  return llm;
}

export function readChatBody(ctx: Context): SendMessageOptions | null {
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      error: "请求体不合法",
      detail: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
    };
    return null;
  }
  const b = parsed.data;
  return {
    protocol: b.protocol,
    message: b.message,
    system: b.system,
    enableThinking: b.enable_thinking,
    thinking: { type: "enabled", budget_tokens: b.thinking_budget },
  };
}
