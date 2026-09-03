/**
 * 职责：业务路由共用入参闸门（有 Key？message 非空？）。
 * 数据流：ctx → 通过则返回值；失败已写 status/body，返回 null，route 直接 return。
 */
import type { Context } from "koa";
import { z } from "zod";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody } from "../compare/types.js";
import { llm } from "./runtime-ctx.js";
import { writeJsonResponse } from "./write-upstream-error.js";

const bodySchema = z.object({
  message: z.string().min(1, "message 不能为空"),
  system: z.string().optional(),
  thinking_budget: z.number().int().positive().optional(),
  enable_thinking: z.boolean().optional(),
});

export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error: "当前 LLM_PROVIDER 没有 Key，对照 Demo 无法调两侧 SDK。",
      hint: "在 apps/.env 填对应 {PROVIDER}_API_KEY。",
    };
    return null;
  }
  return llm;
}

export function readCallBody(ctx: Context): DemoCallBody | null {
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
    message: b.message,
    system: b.system,
    enableThinking: b.enable_thinking ?? false,
    thinkingBudget: b.thinking_budget,
  };
}

/**
 * SSE 端点：先 ctx.respond=false，再闸门。
 * 失败必须自己 writeHead——koa 已经不再发 ctx.body。
 */
export function beginSseCall(
  ctx: Context,
): { client: Llm; body: DemoCallBody } | null {
  ctx.respond = false;
  const body = readCallBody(ctx);
  if (!body) {
    writeJsonResponse(ctx.res, ctx.status || 400, ctx.body);
    return null;
  }
  const client = requireLlm(ctx);
  if (!client) {
    writeJsonResponse(ctx.res, ctx.status || 503, ctx.body);
    return null;
  }
  return { client, body };
}
