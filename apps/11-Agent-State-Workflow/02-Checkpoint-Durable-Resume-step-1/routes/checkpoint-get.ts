/**
 * 职责：GET /api/checkpoint/:runId。只从磁盘读取检查点，不走图、不改状态。
 * 数据流：路径上的 runId → readCheckpoint → 有文件则返回全文，没有则 404。
 * 为什么单独成文件：一个业务 URL 一个文件。和「走一步」拆开，证明读取不依赖刚才那次响应体。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { checkpointFilePath, readCheckpoint } from "../lib/flow/checkpoint-after-step.js";

export function mountCheckpointGetRoutes(router: Router): void {
  router.get("/api/checkpoint/:runId", (ctx: Context, _next: Next) => {
    const started = Date.now();
    const runId = String(ctx.params.runId ?? "").trim();
    logger.info(
      "路由-读取检查点",
      "调用函数开始：GET /api/checkpoint/:runId",
      "为什么写这条日志：页面点了「从磁盘再读一次」。当前：刚进路由。",
      { 入参: { runId } },
    );
    if (!runId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_RUN_ID", message: "路径里缺少任务运行编号（runId）。" } };
      logger.error(
        "路由-读取检查点",
        "调用函数结束：GET /api/checkpoint/:runId（失败）",
        "为什么写这条日志：路径里没有任务运行编号。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    const record = readCheckpoint(runId);
    if (!record) {
      ctx.status = 404;
      ctx.body = {
        ok: false,
        error: {
          code: "CHECKPOINT_NOT_ON_DISK",
          message: "磁盘上还没有这份检查点。请先点「走一步」——文件是走完一步之后才写上去的。",
        },
      };
      logger.error(
        "路由-读取检查点",
        "调用函数结束：GET /api/checkpoint/:runId（失败）",
        "为什么写这条日志：这是给页面看的第二类失败（HTTP 404，文件还不存在）。当前：已返回 404。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    ctx.body = {
      ok: true,
      filePath: checkpointFilePath(runId),
      checkpoint: record,
      请求参数: { runId },
      调用流程: ["按 runId 拼文件路径", "readCheckpoint 读磁盘", "把文件全文返回页面"],
    };
    logger.info(
      "路由-读取检查点",
      "调用函数结束：GET /api/checkpoint/:runId",
      "为什么写这条日志：磁盘上确实有这份检查点。当前：把文件全文交给页面。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
