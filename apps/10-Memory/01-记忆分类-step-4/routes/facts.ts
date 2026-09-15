/**
 * 职责：GET /api/facts（列事实库）+ DELETE /api/facts（清空）。
 * 数据流：facts-store.{listFacts, clearFacts} → ctx.body。
 *
 * 这是同资源的两个动作（读 / 删），按 §5.7 规则同文件。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { listFacts, clearFacts } from "../lib/storage/facts-store.js";
import { deleteFact } from "../lib/storage/fact-delete.js";
import { sendError } from "../lib/http/send-error.js";

export function mountFactsRoutes(router: Router): void {
  router.get("/api/facts", (ctx: Context) => {
    try {
      ctx.body = listFacts();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 500, {
        error: "FACTS_READ_FAILED",
        explain: `读事实库失败：${message}`,
      });
    }
  });

  router.delete("/api/facts", (ctx: Context) => {
    try {
      ctx.body = clearFacts();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 500, {
        error: "FACTS_CLEAR_FAILED",
        explain: `清空事实库失败：${message}`,
      });
    }
  });

  router.delete("/api/facts/:key", (ctx: Context) => {
    const key = decodeURIComponent(ctx.params.key || "");
    if (!key) {
      sendError(ctx, 400, { error: "BAD_KEY", explain: "key 不能为空。" });
      return;
    }
    try {
      ctx.body = deleteFact(key);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 500, {
        error: "FACTS_DELETE_FAILED",
        explain: `删除事实失败：${message}`,
      });
    }
  });
}