/**
 * 职责：POST /api/run/shipping-refund/start 业务例子图（变体 F 收口）—— 开单。
 * 数据流：校验 orderId → startSRRun → 返回新 runId + 初始 state。
 * 为什么单独成文件：一个业务 URL 一个文件。和 /api/run/shipping-refund/step 拆开。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { startSRRun } from "../lib/flow/shipping-refund-graph.js";

const startBody = z.object({
  orderId: z.string(),
});

export function mountRunShippingRefundStartRoutes(router: Router): void {
  router.post("/api/run/shipping-refund/start", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-业务例子-开单",
      "调用函数开始：POST /api/run/shipping-refund/start",
      "为什么写这条日志：变体 F 业务例子图（新开一件任务运行）。",
      { 入参: ctx.request.body },
    );
    const parsed = startBody.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.orderId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的 orderId。" } };
      logger.error(
        "路由-业务例子-开单",
        "调用函数结束：POST /api/run/shipping-refund/start（失败）",
        "为什么写这条日志：没有 orderId。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    const result = startSRRun(parsed.data.orderId.trim());
    ctx.body = {
      ok: true,
      runId: result.runId,
      state: result.state,
      请求参数: { orderId: parsed.data.orderId },
      调用流程: [
        "在内存里建一件业务例子任务运行",
        "currentNode = fetchOrder",
        "本步不调存档器（writeCheckpoint）",
      ],
    };
    logger.info(
      "路由-业务例子-开单",
      "调用函数结束：POST /api/run/shipping-refund/start",
      "为什么写这条日志：业务例子任务运行已建好。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
