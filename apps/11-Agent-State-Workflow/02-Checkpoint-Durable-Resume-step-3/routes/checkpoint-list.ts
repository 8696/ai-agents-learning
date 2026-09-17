/**
 * 职责：GET /api/checkpoint-list?runId=...。列出该任务运行（runId）在存档目录里的所有检查点（Checkpoint）历史。
 * 数据流：路径 query 上的 runId → listCheckpoints → 返回 history 数组。
 * 为什么单独成文件：一个业务 URL 一个文件。引擎不重放，本路由只读不写。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { getHistoryDir, listCheckpoints } from "../lib/flow/checkpoint-history.js";

export function mountCheckpointListRoutes(router: Router): void {
  router.get("/api/checkpoint-list", (ctx: Context, _next: Next) => {
    const started = Date.now();
    const runId = String(ctx.query.runId ?? "").trim();
    logger.info(
      "路由-列出历史",
      "调用函数开始：GET /api/checkpoint-list",
      "为什么写这条日志：快照历史页要点「读一次历史」。",
      { 入参: { runId } },
    );
    if (!runId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_RUN_ID", message: "query 里缺少任务运行编号（runId）。" } };
      logger.error(
        "路由-列出历史",
        "调用函数结束：GET /api/checkpoint-list（失败）",
        "为什么写这条日志：没有任务运行编号。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    const items = listCheckpoints(runId);
    ctx.body = {
      ok: true,
      runId,
      historyDir: getHistoryDir(runId),
      items,
      请求参数: { runId },
      调用流程: [
        "扫 data/checkpoints/{runId}/step-NNNN.json（新布局）或 {runId}.json（旧布局）",
        "每一份都尝试 JSON.parse 校验完整性",
        "返回 history 数组给页面，引擎不重放",
      ],
    };
    logger.info(
      "路由-列出历史",
      "调用函数结束：GET /api/checkpoint-list",
      "为什么写这条日志：历史已列出。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
