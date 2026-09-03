/**
 * 职责：三个业务端点共用的入参闸门（有没有 Key、prompt 是否为空、跑几次、采样参数是否越界）。
 * 数据流：ctx.request.body → 通过则返回解析好的对象；不通过时闸门已写好 ctx.status / ctx.body，
 *   返回 null，route 直接 return（route 里不再重复判空）。
 * 为什么单独成文件：sweep 与 repeat 的 body 有一多半字段相同；闸门散在 route 里，
 *   两边的上下限迟早漂移成「同一个参数一个端点收 0~2、另一个收 0~1」。
 */
import type { Context } from "koa";
import type { Llm } from "../../../../llm.js";
import { z } from "zod";
import { llm } from "./runtime-ctx.js";

/**
 * 本 Demo 所有 POST 端点的入参并集，字段全部可选（不填就用 lib/sampling/presets.ts 的档位）。
 * 上下限的意义：
 *   runs        2~6   —— 少于 2 次没法判「稳不稳」；多于 6 次一次点击就要烧掉十几次真实调用。
 *   temperature 0~2   —— 协议 A 的合法区间，越界会被上游直接 400，不如本地先拦。
 *   topP        0.01~1 —— 0 会把候选集清空，网关行为不统一，这里不放行。
 */
const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000).optional(),
  runs: z.coerce.number().int().min(2).max(6).optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  topP: z.coerce.number().min(0.01).max(1).optional(),
});

export type SamplingBody = z.infer<typeof bodySchema>;

/** ① 没 Key 直接 503：否则要等 SDK 里层抛出来，错误信息对学习者不可读。 */
export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error: "当前 LLM_PROVIDER 没有 Key，无法真实调用（见 apps/.env.example）。",
    };
    return null;
  }
  return llm;
}

/** ② 参数闸门：把 Zod 的 issues 原样回给页面，让「HTTP 400 长什么样」这类错误看得见。 */
export function readSamplingBody(ctx: Context): SamplingBody | null {
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: "请求体不合法", detail: parsed.error.issues };
    return null;
  }
  return parsed.data;
}
