/**
 * 职责：GET /api/store-sources。列出库里所有不同的 source 及其行数（多份文件共存用）。
 */
import Router from "@koa/router";
import { sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";
import { listSources } from "../lib/store/vector-store.js";

export function mountStoreSources(router: Router): void {
  router.get("/api/store-sources", async (ctx) => {
    const started = Date.now();
    logger.info("store-sources", "调用函数开始：GET /api/store-sources", "列出库里所有不同 source（多份文件用）", {
      入参: {},
      __code: "listSources()",
    });
    try {
      const sources = await listSources();
      const result = { sourceCount: sources.length, sources };
      logger.info("store-sources", "调用函数结束：GET /api/store-sources", "返回 source 列表", {
        返回值: result,
        耗时ms: Date.now() - started,
      });
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error("store-sources", "调用函数结束：GET /api/store-sources（失败）", "读 source 列表失败", {
        返回值: error,
        耗时ms: Date.now() - started,
      });
      sendError(ctx, error);
    }
  });
}