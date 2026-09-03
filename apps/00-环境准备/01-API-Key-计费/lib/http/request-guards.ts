/**
 * 职责：业务 route 共用的入参闸门（有没有 Key、prompt 合不合法）。
 * 数据流：koa ctx → 通过则返回解析后的值；不通过时已写好 status/body，返回 null 让 route 直接 return。
 * 为什么单独成文件：两个计费 route 要用同一套判定，判定口径散在 route 里就会一个 400 一个 500。
 */
import type { Context } from "koa";
import { z } from "zod";
import type { Llm } from "../../../../llm.js";
import { llm } from "./runtime-ctx.js";

/**
 * 没配 Key 就别真发请求：503 + 指到 apps/.env。
 * ① 这一步必须在读 body 之前——没 Key 时连参数对错都不重要，先把最贵的那类错误挡掉；
 * ② 也避免让 SDK 抛出一句难读的鉴权错，学习者会以为是自己 prompt 写坏了。
 */
export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error: "当前 LLM_PROVIDER 没有配置 Key，无法计费。",
      hint: "在 apps/.env 里填对应的 {PROVIDER}_API_KEY（见 apps/.env.example）。",
    };
    return null;
  }
  return llm;
}

// max_tokens 上限压到 512：本条只看 usage 怎么分项，不需要让人一次烧掉很多输出 Token。
const billingBodySchema = z.object({
  prompt: z.string().trim().min(1, "prompt 不能为空").max(4000, "prompt 太长（>4000 字符）"),
  maxTokens: z.coerce.number().int().min(1).max(512).default(64),
});

export type BillingBody = z.infer<typeof billingBodySchema>;

/**
 * 解析 POST /api/billing 的 body。
 * ① Zod 而不是手写 if：把「空 prompt」「maxTokens 传成字符串」这些都收敛成同一种 400 形状；
 * ② 页面上的「故意发空 prompt」按钮就是打这条分支，用来演示 HTTP 4xx 长什么样。
 */
export function readBillingBody(ctx: Context): BillingBody | null {
  const parsed = billingBodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      error: "请求体不合法",
      detail: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
    };
    return null;
  }
  return parsed.data;
}
