/**
 * 职责：GET /api/recall，从事实库召回候选事实（默认排除软删除）。
 * 数据流：kvList("default") → { recalled, count }
 *
 * 跟 /api/facts 的差别：/api/facts 给「查看事实库」按钮用，按 key 排序；
 * /api/recall 给「召回」语义，强调排除 deleted_at ≠ NULL 的事实。
 * 两边 kvList 实现一样，分两个端点是为了让页面讲清「召回和总览是两个视图」。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { kvList } from "../lib/db.js";
import { logger } from "../lib/logger.js";

export function mountRecallRoutes(router: Router): void {
  router.get("/api/recall", async (ctx: Context) => {
    logger.info(
      "调用函数-recall",
      "调用函数开始：GET /api/recall",
      "为什么写这条日志：变体 5-C 验证——召回候选必须排除软删除的事实（deleted_at ≠ NULL），否则新会话会把「我不用 React 了」这条又喂给用户。当前：准备按 userId 列未软删的事实。",
      { 入参: { userId: "default" }, __code: "const recalled = await kvList('default');" },
    );
    const t0 = Date.now();
    const recalled = await kvList("default");
    const count = Object.keys(recalled).length;
    logger.info(
      "调用函数-recall",
      "调用函数结束：GET /api/recall",
      `为什么写这条日志：要让 mode-soft-delete 页面看到「DELETE 后召回候选消失」的效果。当前：列出完成（已排除软删除），共 ${count} 条。`,
      { 返回值: { recalled, count }, 耗时ms: Date.now() - t0 },
    );
    ctx.body = { recalled, count };
  });
}
