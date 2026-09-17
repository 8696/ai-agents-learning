/**
 * 职责：GET /api/payment/:runId。只读这一单在支付渠道账本上的调用次数和真实扣款次数。
 * 数据流：路径上的 runId → snapshotPayment → 返回幂等键、调用次数、扣款次数。
 * 为什么单独成文件：一个业务 URL 一个文件。和工作流走一步拆开，证明账本不靠刚才那次响应体。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { paymentLedgerFilePath, snapshotPayment } from "../lib/flow/payment-ledger.js";

export function mountPaymentGetRoutes(router: Router): void {
  router.get("/api/payment/:runId", (ctx: Context, _next: Next) => {
    const started = Date.now();
    const runId = String(ctx.params.runId ?? "").trim();
    logger.info(
      "路由-读取支付渠道",
      "调用函数开始：GET /api/payment/:runId",
      "为什么写这条日志：页面要单独看支付渠道账本。当前：刚进路由。",
      { 入参: { runId } },
    );
    if (!runId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_RUN_ID", message: "路径里缺少任务运行编号（runId）。" } };
      logger.error(
        "路由-读取支付渠道",
        "调用函数结束：GET /api/payment/:runId（失败）",
        "为什么写这条日志：路径里没有任务运行编号。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    const payment = snapshotPayment(runId);
    ctx.body = {
      ok: true,
      runId,
      filePath: paymentLedgerFilePath(),
      payment,
      请求参数: { runId },
      调用流程: ["按 runId 拼幂等键 charge:{runId}", "读支付渠道账本文件", "统计这一单的调用次数和真实扣款次数"],
    };
    logger.info(
      "路由-读取支付渠道",
      "调用函数结束：GET /api/payment/:runId",
      "为什么写这条日志：账本读完。当前：把调用次数和扣款次数交给页面。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
