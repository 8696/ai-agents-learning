/**
 * 职责：业务路由共用的入参闸门（有 Key？prompt 非空？）。
 * 数据流：ctx → 通过则返回值；失败则已写好 status/body，返回 null，route 直接 return。
 */
import type { Context } from "koa";
import type { Llm } from "../../../../llm.js";
import { llm } from "./runtime-ctx.js";

/** 没有配置 Key 时 503，避免后面 create 才炸成难读的 SDK 错。 */
export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = { error: "LLM_PROVIDER 没有 Key（见 apps/.env.example）。" };
    return null;
  }
  return llm;
}

/** body.prompt 去空白后为空 → 400。 */
export function readPrompt(ctx: Context): string | null {
  const { prompt } = ctx.request.body as { prompt?: string };
  if (!prompt?.trim()) {
    ctx.status = 400;
    ctx.body = { error: "prompt 不能为空" };
    return null;
  }
  return prompt;
}
