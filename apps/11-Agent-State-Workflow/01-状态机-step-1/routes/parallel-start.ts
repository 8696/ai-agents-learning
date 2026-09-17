/**
 * 职责：POST /api/parallel/start —— 下一杯要看并行汇合的订单，停在 takeOrder。
 * 数据流：校验饮品名 → createOrder → 返回入口 State + 图 + 对象卡。
 * 为什么单独成文件：并行图的下单 URL 不能和 /api/cafe/start 混在一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { ClientError, createOrder } from "../lib/flow/parallel-step-once.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  drinkName: z.string(),
});

export function mountParallelStartRoutes(router: Router): void {
  router.post("/api/parallel/start", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/parallel/start",
      "调用函数开始：POST /api/parallel/start",
      "为什么写这条日志：并行页左边下单打到这里。当前：准备建订单。",
      { 入参: ctx.request.body, __code: "createOrder(parsed.drinkName)" },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体需要字符串字段 drinkName。" };
      logger.error(
        "POST /api/parallel/start",
        "调用函数结束：POST /api/parallel/start（失败）",
        "为什么写这条日志：入参形状不对。当前：返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    try {
      const 返回值 = createOrder(parsed.data.drinkName);
      ctx.body = { ok: true, ...返回值 };
      logger.info(
        "POST /api/parallel/start",
        "调用函数结束：POST /api/parallel/start",
        "为什么写这条日志：订单已建。当前：把入口 State 交给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        ctx.status = error.status;
        ctx.body = { ok: false, error: error.message };
        logger.error(
          "POST /api/parallel/start",
          "调用函数结束：POST /api/parallel/start（失败）",
          "为什么写这条日志：空饮品名不能进图。当前：返回 400。",
          { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
        );
        return;
      }
      throw error;
    }
  });
}
