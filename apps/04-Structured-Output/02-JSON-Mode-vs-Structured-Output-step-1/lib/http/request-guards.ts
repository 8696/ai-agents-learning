/**
 * 职责：业务路由共用的入参闸门（有 Key？prompt 非空？）。
 * 数据流：ctx → 通过则返回值；失败则已写好 status/body，返回 null，route 直接 return。
 * 为什么单独成文件：json-mode 与 structured-output 的闸门必须同一口径，
 *   否则「空 prompt」一个端点 400、另一个端点把空字符串发给模型，对照就失真。
 */
import type { Context } from "koa";
import type { Llm } from "../../../../llm.js";
import { llm } from "./runtime-ctx.js";

/** ① 没 Key 直接 503：否则要等 SDK 里层抛出来，错误信息对学习者不可读。 */
export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error: "LLM_PROVIDER 没有 Key。在 apps/.env 填对应 Key 后重启（见 apps/.env.example）。",
    };
    return null;
  }
  return llm;
}

/** ② body.prompt 去空白后为空 → 400。strict-rejected 不走这一步（它不收 prompt）。 */
export function readPrompt(ctx: Context): string | null {
  const body = ctx.request.body as { prompt?: string };
  const prompt = body.prompt?.trim();
  if (!prompt) {
    ctx.status = 400;
    ctx.body = { error: "prompt 不能为空" };
    return null;
  }
  return prompt;
}
