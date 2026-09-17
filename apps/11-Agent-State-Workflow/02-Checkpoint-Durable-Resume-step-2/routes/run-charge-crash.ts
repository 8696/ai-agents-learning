/**
 * 职责：POST /api/run/charge-crash。支付渠道扣款成功后，故意不写检查点并清空内存。
 * 数据流：校验 runId → chargeThenCrashBeforeCheckpoint → 返回旧检查点 + 支付渠道账本。
 * 为什么单独成文件：一个业务 URL 一个文件。这是本步核心入口，不要并进 /api/run/step。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { NODE_LABELS } from "../lib/flow/cafe-graph.js";
import { chargeThenCrashBeforeCheckpoint } from "../lib/flow/charge-crash-before-checkpoint.js";

const bodySchema = z.object({
  runId: z.string(),
});

export function mountRunChargeCrashRoutes(router: Router): void {
  router.post("/api/run/charge-crash", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-扣款后不写检查点",
      "调用函数开始：POST /api/run/charge-crash",
      "为什么写这条日志：页面点了「模拟：扣款成功但检查点还没写到磁盘」。当前：刚进路由。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的 runId。请先开始这件任务运行。" } };
      logger.error(
        "路由-扣款后不写检查点",
        "调用函数结束：POST /api/run/charge-crash（失败）",
        "为什么写这条日志：没有任务运行编号。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    try {
      const result = chargeThenCrashBeforeCheckpoint(parsed.data.runId.trim());
      const nodeOnDisk = result.checkpoint?.state.currentNode;
      ctx.body = {
        ok: true,
        runId: result.runId,
        before: result.before,
        inMemoryAfter: result.inMemoryAfter,
        filePath: result.filePath,
        checkpoint: result.checkpoint,
        payment: result.payment,
        请求参数: { runId: parsed.data.runId },
        调用流程: [
          "确认当前停在 " + NODE_LABELS[result.before.currentNode],
          "调用支付渠道 chargeMemberCard（钱在这里被扣掉）",
          "不写 executedToolCallIds，不改 currentNode，不调用 writeCheckpoint",
          "清空内存，模拟进程没了",
          "磁盘上仍是 "
            + (nodeOnDisk ? NODE_LABELS[nodeOnDisk] : "（没有文件）")
            + "，支付渠道账本已经记了一笔",
        ],
      };
      logger.info(
        "路由-扣款后不写检查点",
        "调用函数结束：POST /api/run/charge-crash",
        "为什么写这条日志：钱已扣、检查点仍是旧的、内存已空。当前：把对照交给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const client
        = err.code === "RUN_NOT_FOUND" || err.code === "NOT_AT_CHARGE_CARD";
      ctx.status = client ? 400 : 500;
      ctx.body = {
        ok: false,
        error: {
          code: err.code ?? "CHARGE_CRASH_FAILED",
          message: err.message ?? "模拟扣款后不写检查点失败",
        },
      };
      logger.error(
        "路由-扣款后不写检查点",
        "调用函数结束：POST /api/run/charge-crash（失败）",
        "为什么写这条日志：还没停在扣卡站，或内存里没有这件任务运行。当前：已返回错误给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
