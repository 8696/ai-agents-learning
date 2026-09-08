/**
 * 职责：/api/compare 的入参闸门（Key、问题文本、两版 Prompt、modes）。
 * 数据流：ctx.request.body → 通过则返回对象；失败已写 ctx.status / ctx.body，返回 null。
 *
 * 日志（§5.3.16）：工具档——五件套（含 __code）仍要；闸门挡掉打 warn / error。
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
  const t0 = Date.now();
  if (!llm) {
    logger.error(
      "│ 闸门-requireLlm",
      "调用函数结束：requireLlm",
      "为什么打：当前 LLM_PROVIDER 没有 Key（见 apps/.env.example）；503 回前端；这是阻塞性错误必须立刻告诉用户怎么修。error + （失败）见 spec §5.3.16。",
      {
        返回值: { ok: false, status: 503 },
        provider: process.env.LLM_PROVIDER ?? null,
        耗时ms: Date.now() - t0,
      },
    );
    ctx.status = 503;
    ctx.body = {
      error: "当前 LLM_PROVIDER 没有 Key，无法真实调用（见 apps/.env.example）。",
    };
    return null;
  }
  logger.debug(
    "│ 闸门-requireLlm",
    "调用函数结束：requireLlm",
    "为什么打：debug 是「细节」等级；闸门是高频路径，命中 ok 时不打 info 免刷屏。当前：llm 已就绪。",
    {
      返回值: { ok: true, status: 200, provider: llm.provider },
      耗时ms: Date.now() - t0,
    },
  );
  return llm;
}

export function readCompareBody(ctx: Context): CompareBody | null {
  const t0 = Date.now();
  const parsed = bodySchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) {
    logger.warn(
      "│ 闸门-readCompareBody",
      "调用函数结束：readCompareBody（失败）",
      "为什么打：Zod 校验失败（text 空 / 超长 / modes 不在 v1,v2）；这是业务失败不是 LLM 错，走 400 不让对照浪费 token。",
      {
        返回值: { ok: false, status: 400 },
        issues: parsed.error.issues,
        rawBody: ctx.request.body,
        耗时ms: Date.now() - t0,
      },
    );
    ctx.status = 400;
    ctx.body = {
      error: "参数错误",
      details: parsed.error.flatten(),
      hint: "text 不能为空；modes 至少含 v1 或 v2",
    };
    return null;
  }
  logger.debug(
    "│ 闸门-readCompareBody",
    "调用函数结束：readCompareBody",
    "为什么打：debug 等级；闸门是高频路径，命中 ok 时不打 info 免刷屏。当前：body 已通过校验。",
    {
      返回值: { ok: true, status: 200, textLen: parsed.data.text.length, modes: parsed.data.modes, v1Len: parsed.data.prompts.v1.length, v2Len: parsed.data.prompts.v2.length },
      耗时ms: Date.now() - t0,
    },
  );
  return parsed.data;
}