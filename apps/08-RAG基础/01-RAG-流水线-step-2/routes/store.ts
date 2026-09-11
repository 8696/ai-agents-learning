/**
 * 职责：GET /api/store。把 SQLite 里已写入的所有行读出来，不拆库、不提问。
 */
import Router from "@koa/router";
import { sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";
import { listChunks } from "../lib/store/vector-store.js";

export function mountStore(router: Router): void {
  router.get("/api/store", async (ctx) => {
    const started = Date.now();
    logger.info("store", "调用函数开始：GET /api/store", "查看库入口。里面只做 SELECT。", {
      入参: {},
      __code: "listChunks()",
    });
    try {
      const rows = await listChunks();
      const result = {
        engine: "sqlite",
        dbFile: "data/chunks.db",
        table: "chunks",
        columns: ["id", "vector", "text", "source", "section", "chunkIndex"],
        rowCount: rows.length,
        rows,
      };
      logger.info("store", "调用函数结束：GET /api/store", "已经把库里的行交给页面。", {
        返回值: result,
        耗时ms: Date.now() - started,
      });
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error("store", "调用函数结束：GET /api/store（失败）", "读库失败", {
        返回值: error,
        耗时ms: Date.now() - started,
      });
      sendError(ctx, error);
    }
  });
}