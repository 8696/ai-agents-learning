/**
 * 职责：GET /api/trash，列出软删除的事实（deleted_at ≠ NULL）。
 * 数据流：kvTrash("default") → { facts, count }
 *
 * 验收 ④：软删除的那条从召回中消失，但在「已删除」视图里还能看到。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { kvTrash } from "../lib/history-store.js";
import { logger } from "../lib/logger.js";

export function mountTrashRoutes(router: Router): void {
  router.get("/api/trash", async (ctx: Context) => {
    logger.info(
      "调用函数-trash",
      "调用函数开始：GET /api/trash",
      "为什么写这条日志：变体 5-C「已删除」视图——把软删除的事实列出来，方便验收 ④（软删除的条从召回消失，但「已删除」视图还在）。当前：准备按 userId 列软删除的事实。",
      { 入参: { userId: "default" }, __code: "const trashed = await kvTrash('default');" },
    );
    const t0 = Date.now();
    const trashed = await kvTrash("default");
    const count = Object.keys(trashed).length;
    logger.info(
      "调用函数-trash",
      "调用函数结束：GET /api/trash",
      `为什么写这条日志：要让 mode-soft-delete 页面看到「DELETE 后这条还在 trash 视图」的效果。当前：列出完成，共 ${count} 条。`,
      { 返回值: { facts: trashed, count }, 耗时ms: Date.now() - t0 },
    );
    ctx.body = { facts: trashed, count };
  });
}
