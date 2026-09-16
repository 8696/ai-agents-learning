/**
 * 职责：8-B 审计写入 —— 写一条事实（带 audit + kvSet）。
 *
 * 数据流：recordAuditWrite({ userId, key, value, source, confidence, idempotencyKey })
 *   → kvGet(key) 拿旧值
 *   → 决定 action：库里没有 → NEW；有 → UPDATE（演示用最简版本）
 *   → kvSet(key, value) 真正写入库
 *   → recordAudit(...) 写一行 audit_log
 *   → 返 { audit, action, previousValue, currentValue }
 *
 * 为什么单独成文件：本步核心的一部分（8-B 写一条事实 = 查旧 + 写入库 + 留痕三步走）。
 */
import { kvGet, kvSet } from "../store-kv.js";
import { recordAudit, type AuditAction, type AuditRow } from "../store-audit.js";
import { logger } from "../logger.js";

export interface AuditWriteInput {
  userId: string;
  key: string;
  value: unknown;
  source: { sessionId: string; messageIndex: number };
  confidence: number;
  idempotencyKey: string | null;
}

export interface AuditWriteResult {
  audit: AuditRow;
  action: AuditAction;
  previousValue: unknown | null;
  currentValue: unknown;
}

export async function recordAuditWrite(input: AuditWriteInput): Promise<AuditWriteResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-recordAuditWrite",
    "调用函数开始：recordAuditWrite",
    `为什么写这条日志：8-B 审计写入——kvSet 之前先查旧值决定 action，写之前再 recordAudit 让 audit_log 永远先于库变化。当前：key = ${input.key}。`,
    { 入参: input },
  );

  // 1. 查旧值决定 action
  const previousValue = await kvGet(input.userId, input.key);
  const action: AuditAction = previousValue === undefined ? "NEW" : "UPDATE";

  // 2. 写库
  await kvSet(input.userId, input.key, input.value);

  // 3. 记审计
  const audit = recordAudit({
    userId: input.userId,
    action,
    key: input.key,
    oldValue: previousValue === undefined ? null : previousValue,
    newValue: input.value,
    sourceSessionId: input.source.sessionId,
    sourceMessageIndex: input.source.messageIndex,
    confidence: input.confidence,
    idempotencyKey: input.idempotencyKey,
  });

  const result: AuditWriteResult = { audit, action, previousValue: previousValue === undefined ? null : previousValue, currentValue: input.value };
  logger.info(
    "调用函数-recordAuditWrite",
    "调用函数结束：recordAuditWrite",
    `为什么写这条日志：让路由层拿到 audit_id 写 idempotency_keys 表 + 返给前端。当前：action = ${action}，audit_id = ${audit.id}。`,
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}
