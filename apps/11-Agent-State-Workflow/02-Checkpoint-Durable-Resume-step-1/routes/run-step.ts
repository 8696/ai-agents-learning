/**
 * 职责：POST /api/run/step。走一步并把检查点写到磁盘，再读回来给页面。
 * 数据流：校验 runId → stepOnceAndWrite → 返回走之前/之后的状态 + 磁盘上的检查点全文。
 * 为什么单独成文件：一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { NODE_LABELS } from "../lib/flow/cafe-graph.js";
import { stepOnceAndWrite } from "../lib/flow/step-with-checkpoint.js";

const bodySchema = z.object({
  runId: z.string(),
  keepHistory: z.boolean().optional(),
});

export function mountRunStepRoutes(router: Router): void {
  router.post("/api/run/step", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-走一步并写入",
      "调用函数开始：POST /api/run/step",
      "为什么写这条日志：页面点了「走一步」。当前：刚进路由。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的 runId。请先开始这件任务运行。" } };
      logger.error(
        "路由-走一步并写入",
        "调用函数结束：POST /api/run/step（失败）",
        "为什么写这条日志：没有任务运行编号。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    const keepHistory = Boolean(parsed.data.keepHistory);

    try {
      const result = stepOnceAndWrite(parsed.data.runId.trim(), keepHistory);
      ctx.body = {
        ok: true,
        runId: result.runId,
        before: result.before,
        state: result.state,
        stopped: result.stopped,
        filePath: result.filePath,
        checkpoint: result.checkpoint,
        payment: result.payment,
        请求参数: { runId: parsed.data.runId, keepHistory },
        调用流程: [
          "从内存取出当前状态",
          "跑节点 " + NODE_LABELS[result.before.currentNode],
          "当前节点（currentNode）改为 " + NODE_LABELS[result.state.currentNode],
          keepHistory
            ? "writeCheckpoint 写入最新一份 + 在 data/checkpoints/{runId}/step-NNNN.json 留历史副本"
            : "writeCheckpoint 覆盖写入同一份磁盘文件",
          "readCheckpoint 从磁盘读回全文",
          result.payment.lastHitIdempotency
            ? "支付渠道：最近一次命中幂等（Idempotency），真实扣款次数仍是 "
              + String(result.payment.deductionCount)
            : "支付渠道：调用次数 "
              + String(result.payment.callCount)
              + "，真实扣款次数 "
              + String(result.payment.deductionCount),
        ],
      };
      logger.info(
        "路由-走一步并写入",
        "调用函数结束：POST /api/run/step",
        "为什么写这条日志：一步走完并且磁盘上已有检查点。当前：把文件全文交给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const notFound = err.code === "RUN_NOT_FOUND";
      const stopped = err.code === "ALREADY_STOPPED";
      ctx.status = notFound || stopped ? 400 : 500;
      ctx.body = {
        ok: false,
        error: {
          code: err.code ?? "STEP_FAILED",
          message: err.message ?? "走一步失败",
        },
      };
      logger.error(
        "路由-走一步并写入",
        "调用函数结束：POST /api/run/step（失败）",
        "为什么写这条日志：走一步或写入检查点失败。当前：已返回错误给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
