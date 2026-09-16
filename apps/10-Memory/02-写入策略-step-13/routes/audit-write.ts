/**
 * 职责：POST /api/audit/write —— 写一条事实（带 audit + kvSet）。
 * 数据流：{ userId?, key, value, confidence, sourceSessionId?, sourceMessageIndex? }
 *   → recordAuditWrite(...) → 返 { audit, action, previousValue, currentValue }
 *
 * 用于 8-B sub-page 演示「产生 audit 行」（NEW / UPDATE 两种 action 都走）。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { recordAuditWrite } from "../lib/flow/audit-write.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  userId: z.string().optional(),
  key: z.string().min(1).max(200),
  value: z.unknown(),
  confidence: z.number().min(0).max(1).default(0.9),
  sourceSessionId: z.string().optional(),
  sourceMessageIndex: z.number().int().nonnegative().optional(),
});

export function mountAuditWriteRoutes(router: Router): void {
  router.post("/api/audit/write", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, { error: "BAD_BODY", explain: "key / value / confidence 必填；sourceSessionId / sourceMessageIndex 可选" });
      return;
    }
    const userId = parsed.data.userId || "default";
    const source = {
      sessionId: parsed.data.sourceSessionId || "demo-session",
      messageIndex: parsed.data.sourceMessageIndex ?? 0,
    };

    const t0 = Date.now();
    logger.info(
      "调用函数-audit-write-route",
      "调用函数开始：POST /api/audit/write",
      "为什么写这条日志：8-B 审计演示——写一条事实，audit_log + kv 库都加一行。",
      { 入参: { userId, key: parsed.data.key, source } },
    );

    const result = await recordAuditWrite({
      userId,
      key: parsed.data.key,
      value: parsed.data.value,
      source,
      confidence: parsed.data.confidence,
      idempotencyKey: null, // 8-B 演示用，不走幂等
    });

    logger.info(
      "调用函数-audit-write-route",
      "调用函数结束：POST /api/audit/write",
      "为什么写这条日志：让前端拿到 audit_id 跳到那一行。",
      { 返回值: { auditId: result.audit.id, action: result.action }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = result;
  });
}
