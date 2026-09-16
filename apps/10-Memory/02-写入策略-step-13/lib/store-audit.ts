/**
 * 职责：audit_log 表的读写层 —— recordAudit / listAudit / getAudit / markAuditRolledBack。
 * 数据流：lib/flow/audit-write.ts + lib/flow/audit-rollback.ts + routes/audit-list.ts → 这里 4 个函数 → audit_log 表
 */
import { db, nowIso, parseJsonField } from "./db.js";
import { logger } from "./logger.js";

export type AuditAction = "NEW" | "UPDATE" | "MERGE" | "DELETE" | "NOOP" | "BLOCKED";

export interface AuditRow {
  id: number;
  user_id: string;
  action: AuditAction;
  key: string;
  old_value: unknown | null;
  new_value: unknown | null;
  source_session_id: string | null;
  source_message_index: number | null;
  confidence: number | null;
  idempotency_key: string | null;
  created_at: string;
  rolled_back_at: string | null;
}

const stmtAuditInsert = db.prepare(`INSERT INTO audit_log (
  user_id, action, key, old_value, new_value,
  source_session_id, source_message_index, confidence, idempotency_key, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const stmtAuditList = db.prepare("SELECT * FROM audit_log WHERE user_id = ? ORDER BY id DESC");
const stmtAuditGet  = db.prepare("SELECT * FROM audit_log WHERE id = ?");
const stmtAuditMarkRolledBack = db.prepare("UPDATE audit_log SET rolled_back_at = ? WHERE id = ?");

function auditRowFromDb(row: Record<string, unknown>): AuditRow {
  return {
    id: row.id as number,
    user_id: row.user_id as string,
    action: row.action as AuditAction,
    key: row.key as string,
    old_value: parseJsonField(row.old_value as string | null),
    new_value: parseJsonField(row.new_value as string | null),
    source_session_id: row.source_session_id as string | null,
    source_message_index: row.source_message_index as number | null,
    confidence: row.confidence as number | null,
    idempotency_key: row.idempotency_key as string | null,
    created_at: row.created_at as string,
    rolled_back_at: row.rolled_back_at as string | null,
  };
}

export interface RecordAuditInput {
  userId: string;
  action: AuditAction;
  key: string;
  oldValue: unknown | null;
  newValue: unknown | null;
  sourceSessionId: string;
  sourceMessageIndex: number;
  confidence: number | null;
  idempotencyKey: string | null;
}

export function recordAudit(input: RecordAuditInput): AuditRow {
  const t0 = Date.now();
  logger.info(
    "调用函数-recordAudit",
    "调用函数开始：recordAudit",
    "为什么写这条日志：第 8 关「审计 + 可回溯」—— 每次写入都先打一行审计，再真正动 kv 库；回滚按这一行反着执行。",
    { 入参: input },
  );
  const r = stmtAuditInsert.run(
    input.userId,
    input.action,
    input.key,
    input.oldValue === null ? null : JSON.stringify(input.oldValue),
    input.newValue === null ? null : JSON.stringify(input.newValue),
    input.sourceSessionId,
    input.sourceMessageIndex,
    input.confidence,
    input.idempotencyKey,
    nowIso(),
  );
  const row = stmtAuditGet.get(r.lastInsertRowid) as Record<string, unknown>;
  const audit = auditRowFromDb(row);
  logger.info(
    "调用函数-recordAudit",
    "调用函数结束：recordAudit",
    `为什么写这条日志：让调用方拿到 audit_id 写 idempotency_keys 行 + 回给前端。当前：audit_id = ${audit.id}。`,
    { 返回值: audit, 耗时ms: Date.now() - t0 },
  );
  return audit;
}

export function listAudit(userId: string): AuditRow[] {
  const t0 = Date.now();
  logger.info(
    "调用函数-listAudit",
    "调用函数开始：listAudit",
    "为什么写这条日志：8-B 审计表 sub-page 列出该 user 的所有 audit 行，按 id DESC（最新在最上）。",
    { 入参: { userId } },
  );
  const rows = stmtAuditList.all(userId) as Array<Record<string, unknown>>;
  const audits = rows.map(auditRowFromDb);
  logger.info(
    "调用函数-listAudit",
    "调用函数结束：listAudit",
    `为什么写这条日志：让前端看到「库有多少次写入 + 撤回比例」。当前：共 ${audits.length} 条。`,
    { 返回值: audits, 耗时ms: Date.now() - t0 },
  );
  return audits;
}

export function getAudit(auditId: number): AuditRow | null {
  const row = stmtAuditGet.get(auditId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return auditRowFromDb(row);
}

export function markAuditRolledBack(auditId: number, rolledBackAt: string): { changes: number } {
  const r = stmtAuditMarkRolledBack.run(rolledBackAt, auditId);
  return { changes: r.changes };
}
