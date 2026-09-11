/**
 * 职责：POST /api/ingest。校验后调用拆库主流程。
 */
import Router from "@koa/router";
import { runIngest } from "../lib/flow/ingest-pipeline.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

export function mountIngest(router: Router): void {
  router.post("/api/ingest", async (ctx) => {
    const started = Date.now();
    logger.info("ingest", "调用函数开始：POST /api/ingest", "建库入口。里面才是加载 / 切块 / 向量化。", {
      入参: jsonBody(ctx),
      __code: "runIngest()",
    });
    try {
      const result = await runIngest();
      logger.info("ingest", "调用函数结束：POST /api/ingest", "拆库完成，页面应能看见一书变多行。", {
        返回值: result,
        耗时ms: Date.now() - started,
      });
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "ingest",
        "调用函数结束：POST /api/ingest（失败）",
        error instanceof HttpError ? error.hint : "拆库失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}
