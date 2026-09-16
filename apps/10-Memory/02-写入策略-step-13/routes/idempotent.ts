/**
 * 职责：8-C 写入幂等端点。
 *
 * 端点：POST /api/idempotent/write
 * 数据流：{ userId?, idempotencyKey, key, value, confidence, sourceSessionId?, sourceMessageIndex? }
 *   → lib/flow/idempotent.writeWithIdempotency(...)
 *   → 返 { isDuplicate, audit, action, currentValue, response }
 *
 * 演示：前端连点"写入"按钮两次（同 idempotencyKey）→ 第二次命中幂等、isDuplicate=true，库只多一条。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { writeWithIdempotency } from "../lib/flow/idempotent.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  userId: z.string().optional(),
  idempotencyKey: z.string().min(1).max(200),
  key: z.string().min(1).max(200),
  value: z.unknown(),
  confidence: z.number().min(0).max(1).default(0.9),
  sourceSessionId: z.string().optional(),
  sourceMessageIndex: z.number().int().nonnegative().optional(),
});

export function mountIdempotentRoutes(router: Router): void {
  router.post("/api/idempotent/write", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, { error: "BAD_BODY", explain: "idempotencyKey / key / value / confidence 必填；userId / sourceSessionId / sourceMessageIndex 可选" });
      return;
    }
    const userId = parsed.data.userId || "default";
    const source = {
      sessionId: parsed.data.sourceSessionId || "demo-session",
      messageIndex: parsed.data.sourceMessageIndex ?? 0,
    };

    const t0 = Date.now();
    logger.info(
      "调用函数-idempotent-route",
      "调用函数开始：POST /api/idempotent/write",
      "为什么写这条日志：8-C 写入幂等——同 idempotencyKey 重复请求只生效一次；网络重试 / 用户连点「写入」不会让库里多一条。",
      { 入参: { userId, idempotencyKey: parsed.data.idempotencyKey, key: parsed.data.key, source } },
    );

    const r = await writeWithIdempotency({
      userId,
      idempotencyKey: parsed.data.idempotencyKey,
      key: parsed.data.key,
      value: parsed.data.value,
      source,
      confidence: parsed.data.confidence,
    });

    logger.info(
      "调用函数-idempotent-route",
      "调用函数结束：POST /api/idempotent/write",
      `为什么写这条日志：让前端看到 isDuplicate / audit_id / 当前值。当前：isDuplicate = ${r.isDuplicate}，audit_id = ${r.audit?.id ?? "—"}。`,
      { 返回值: { isDuplicate: r.isDuplicate, auditId: r.audit?.id ?? null, key: r.response.factKey }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = r;
  });
}
