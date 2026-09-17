/**
 * 职责：POST /api/run/shipping-refund/step 业务例子图（变体 F 收口）—— 走一步。
 * 数据流：校验 runId → stepOnceSR → 返回 state。
 * 为什么单独成文件：一个业务 URL 一个文件。和 /api/run/shipping-refund/start 拆开。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { stepOnceSR } from "../lib/flow/shipping-refund-graph.js";

const stepBody = z.object({
  runId: z.string(),
});

export function mountRunShippingRefundStepRoutes(router: Router): void {
  router.post("/api/run/shipping-refund/step", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-业务例子-走一步",
      "调用函数开始：POST /api/run/shipping-refund/step",
      "为什么写这条日志：业务例子图走一步。",
      { 入参: ctx.request.body },
    );
    const parsed = stepBody.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_RUN_ID", message: "请求体需要非空的 runId。" } };
      logger.error(
        "路由-业务例子-走一步",
        "调用函数结束：POST /api/run/shipping-refund/step（失败）",
        "为什么写这条日志：没有任务运行编号。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    try {
      const result = stepOnceSR(parsed.data.runId.trim());
      ctx.body = {
        ok: true,
        runId: result.runId,
        state: result.state,
        stopped: result.stopped,
        请求参数: { runId: parsed.data.runId },
        调用流程: [
          "从内存取出当前状态",
          "跑当前节点（fetchOrder / checkShipment / noop / refund）",
          "路由挑下一站；checkShipment 看 isShipped 选 noop 或 refund",
          "合并 patch，写 currentNode",
          "**不**调 writeCheckpoint——本步只演示同图同 runId 判定",
        ],
      };
      logger.info(
        "路由-业务例子-走一步",
        "调用函数结束：POST /api/run/shipping-refund/step",
        "为什么写这条日志：业务例子走完一步。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const client = err.code === "RUN_NOT_FOUND" || err.code === "ALREADY_STOPPED" || err.code === "ILLEGAL_EDGE";
      ctx.status = client ? 400 : 500;
      ctx.body = {
        ok: false,
        error: { code: err.code ?? "SR_STEP_FAILED", message: err.message ?? "业务例子走一步失败" },
      };
      logger.error(
        "路由-业务例子-走一步",
        "调用函数结束：POST /api/run/shipping-refund/step（失败）",
        "为什么写这条日志：内存里没有这件业务例子任务运行，或已到 done。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
