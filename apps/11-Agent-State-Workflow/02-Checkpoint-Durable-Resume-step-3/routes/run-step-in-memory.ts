/**
 * 职责：POST /api/run/step-in-memory。走一步并**只更新内存**，故意不写磁盘。
 * 数据流：校验 runId → stepOnceInMemoryOnly → 返回走之前/之后的状态（没有 filePath / checkpoint）。
 * 为什么单独成文件：一个业务 URL 一个文件。/api/run/step 写磁盘；/api/run/step-in-memory 不写磁盘；两侧独立请求，便于对照。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { stepOnceInMemoryOnly } from "../lib/flow/step-in-memory-only.js";

const bodySchema = z.object({
  runId: z.string(),
});

export function mountRunStepInMemoryRoutes(router: Router): void {
  router.post("/api/run/step-in-memory", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-只更新内存",
      "调用函数开始：POST /api/run/step-in-memory",
      "为什么写这条日志：内存 vs 磁盘页点了「走一步（只放内存）」。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的 runId。请先开始这件任务运行。" } };
      logger.error(
        "路由-只更新内存",
        "调用函数结束：POST /api/run/step-in-memory（失败）",
        "为什么写这条日志：没有任务运行编号。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    try {
      const result = stepOnceInMemoryOnly(parsed.data.runId.trim());
      ctx.body = {
        ok: true,
        runId: result.runId,
        before: result.before,
        state: result.state,
        stopped: result.stopped,
        payment: result.payment,
        请求参数: { runId: parsed.data.runId },
        调用流程: [
          "从内存取出当前状态",
          "跑节点（模拟 LangGraph MemorySaver）",
          "当前节点（currentNode）改为下一站",
          "**不**调 writeCheckpoint——磁盘上**不**留任何文件",
          "这一件任务运行只活在进程内的 Map 里",
        ],
      };
      logger.info(
        "路由-只更新内存",
        "调用函数结束：POST /api/run/step-in-memory",
        "为什么写这条日志：内存里走完一步，磁盘上仍无文件。",
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
          code: err.code ?? "STEP_IN_MEMORY_FAILED",
          message: err.message ?? "只更新内存走一步失败",
        },
      };
      logger.error(
        "路由-只更新内存",
        "调用函数结束：POST /api/run/step-in-memory（失败）",
        "为什么写这条日志：内存里没有这件任务运行，或已到终止站。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
