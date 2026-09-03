/**
 * 职责：业务路由共用闸门 —— 有没有 Key。本条 POST 无 body，不做 prompt 校验。
 * 数据流：ctx → 有 Key 返回 Llm；没有则已写 503，route 直接 return。
 */
import type { Context } from "koa";
import type { Llm } from "../../../../llm.js";
import { llm } from "./runtime-ctx.js";

/** 没 Key 时 503，避免后面 create 才炸成难读的 SDK 错。 */
export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error: "LLM_PROVIDER 没有 Key（见 apps/.env.example）。",
      hint: "页脚 Key ❌ 时主按钮应已禁用；这是服务端兜底。",
    };
    return null;
  }
  return llm;
}
