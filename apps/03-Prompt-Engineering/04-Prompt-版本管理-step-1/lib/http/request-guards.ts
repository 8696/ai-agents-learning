/**
 * 职责：/api/compare 的入参闸门（Key、问题文本、两版 Prompt、modes）。
 * 数据流：ctx.request.body → 通过则返回对象；失败已写 ctx.status / ctx.body，返回 null。
 *
 * 日志（§5.3.16）：guard.no-key —— 503 时打，便于立刻定位是 provider 配置问题；
 *   400 的 Zod 失败在 routes/compare.ts（compare.bad-input）里打更完整。
 */
import type { Context } from "koa";
import type { Llm } from "../../../../llm.js";
import { z } from "zod";
import { llm } from "./runtime-ctx.js";
import { logger } from "../logger.js";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
  modes: z.array(z.enum(["v1", "v2"])).min(1).max(2),
  prompts: z.object({
    v1: z.string().min(1).max(2000),
    v2: z.string().min(1).max(2000),
  }),
});

export type CompareBody = z.infer<typeof bodySchema>;

export function requireLlm(ctx: Context): Llm | null {
  if (!llm) {
    logger.error(
      "guard.no-key",
      "未配置 LLM Key",
      "当前 LLM_PROVIDER 没有 Key（见 apps/.env.example）；503 回前端；这是阻塞性错误必须立刻告诉用户怎么修",
      { provider: process.env.LLM_PROVIDER ?? null },
    );
    ctx.status = 503;
    ctx.body = {
      error: "当前 LLM_PROVIDER 没有 Key，无法真实调用（见 apps/.env.example）。",
    };
    return null;
  }
  return llm;
}

export function readCompareBody(ctx: Context): CompareBody | null {
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = {
      error: "参数错误",
      details: parsed.error.flatten(),
      hint: "text 不能为空；modes 至少含 v1 或 v2",
    };
    return null;
  }
  return parsed.data;
}
