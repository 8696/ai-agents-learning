/**
 * 职责：POST /api/audit/rollback —— 按 audit_id 撤回。
 * 数据流：{ auditId, userId? } → rollbackAuditById(auditId) → RollbackResult
 *
 * 8-B 一键撤回：按 action 反向恢复事实库 + 标 audit_log.rolled_back_at。
 * 库里被改过则拒绝盲撤回（防吃新值）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { rollbackAuditById } from "../lib/flow/audit-rollback.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  userId: z.string().optional(),
  auditId: z.number().int().positive(),
});

export function mountAuditRollbackRoutes(router: Router): void {
  router.post("/api/audit/rollback", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, { error: "BAD_BODY", explain: "auditId 必填（正整数）" });
      return;
    }
    const { auditId } = parsed.data;
    logger.info(
      "调用函数-audit-rollback-route",
      "调用函数开始：POST /api/audit/rollback",
      "为什么写这条日志：8-B 一键撤回——按 audit_id 反向恢复 kv 库 + 标 audit_log.rolled_back_at。",
      { 入参: { auditId } },
    );
    const r = await rollbackAuditById(auditId);
    logger.info(
      "调用函数-audit-rollback-route",
      "调用函数结束：POST /api/audit/rollback",
      `当前：success = ${r.success}；${r.reason}`,
      { 返回值: r, 字段释义: {
        "success": "true = 撤回成功；false = 拒绝（理由在 reason）",
        "restoredValue": "撤回后这条事实库里的值（null = 真删）",
        "reason": "成功则『已撤回』；拒绝时说明为什么（库被改过 / 已撤回过 / MERGE 等无库动作）",
      } },
    );
    ctx.body = r;
  });
}
