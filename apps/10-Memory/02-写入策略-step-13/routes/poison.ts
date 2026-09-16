/**
 * 职责：POST /api/poison/check —— 8-A 投毒拦截端点。
 * 数据流：{ text } → lib/flow/poison.detectPoisoning(text) → 返 { result, modelRequest, modelResponse }
 *
 * 演示页要求：把「投毒判定 + category + 理由 + 完整 modelRequest + 完整 modelResponse」全亮出来。
 * 满足笔记 §0 需求 8 验收 ①。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { detectPoisoning } from "../lib/flow/poison.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  text: z.string().min(1).max(2000),
});

export function mountPoisonRoutes(router: Router): void {
  router.post("/api/poison/check", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, { error: "BAD_BODY", explain: "text 必填且 1~2000 字" });
      return;
    }
    const { text } = parsed.data;

    const t0 = Date.now();
    logger.info(
      "调用函数-poison-route",
      "调用函数开始：POST /api/poison/check",
      "为什么写这条日志：8-A 投毒拦截——把用户原话送进 detectPoisoning；这一步会真发一次网络请求。",
      { 入参: { text } },
    );

    const result = await detectPoisoning(text);

    logger.info(
      "调用函数-poison-route",
      "调用函数结束：POST /api/poison/check",
      `为什么写这条日志：让前端拿到完整结果用于亮出 category / isPoisoned / reason / modelRequest / modelResponse。当前：category = ${result.category}，isPoisoned = ${result.isPoisoned}。`,
      { 返回值: { category: result.category, isPoisoned: result.isPoisoned }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = result;
  });
}
