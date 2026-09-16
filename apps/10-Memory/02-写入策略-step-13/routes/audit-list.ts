/**
 * 职责：GET /api/audit + GET /api/audit/:id —— 审计表查询。
 * 数据流：
 *   GET /api/audit?userId=default → listAudit(userId) → AuditRow[]
 *   GET /api/audit/:id             → getAudit(id) → AuditRow | null
 *
 * 8-B 审计表 sub-page 列表渲染 + 调试时单条详情用。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { sendError } from "../lib/http/send-error.js";
import { listAudit, getAudit } from "../lib/store-audit.js";
import { logger } from "../lib/logger.js";

export function mountAuditListRoutes(router: Router): void {
  router.get("/api/audit", (ctx: Context) => {
    const userId = (ctx.query.userId as string) || "default";
    logger.info(
      "调用函数-audit-list-route",
      "调用函数开始：GET /api/audit",
      "为什么写这条日志：8-B 审计表 sub-page 实时刷新审计表。",
      { 入参: { userId } },
    );
    const rows = listAudit(userId);
    logger.info(
      "调用函数-audit-list-route",
      "调用函数结束：GET /api/audit",
      `当前：共 ${rows.length} 条。`,
      { 返回值: { count: rows.length }, 字段释义: { "count": "该 user 的 audit_log 总条数（含已撤回）" } },
    );
    ctx.body = rows;
  });

  router.get("/api/audit/:id", (ctx: Context) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      sendError(ctx, 400, { error: "BAD_ID", explain: "id 必须是正整数" });
      return;
    }
    const row = getAudit(id);
    if (!row) {
      sendError(ctx, 404, { error: "NOT_FOUND", explain: "找不到这条 audit" });
      return;
    }
    ctx.body = row;
  });
}
