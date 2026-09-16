/**
 * 职责：idempotency_keys 表的读写层 —— getIdempotency / recordIdempotency。
 * 数据流：lib/flow/idempotent.ts → 这里 2 个函数 → idempotency_keys 表
 */
import { db, nowIso, parseJsonField } from "./db.js";

export interface IdempotencyRow {
  key: string;
  user_id: string;
  request_hash: string;
  response: unknown;
  audit_id: number | null;
  created_at: string;
}

const stmtIdemGet    = db.prepare("SELECT * FROM idempotency_keys WHERE key = ?");
const stmtIdemInsert = db.prepare(`INSERT INTO idempotency_keys (key, user_id, request_hash, response, audit_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

function idemRowFromDb(row: Record<string, unknown>): IdempotencyRow {
  return {
    key: row.key as string,
    user_id: row.user_id as string,
    request_hash: row.request_hash as string,
    response: parseJsonField(row.response as string),
    audit_id: row.audit_id as number | null,
    created_at: row.created_at as string,
  };
}

export function getIdempotency(key: string): IdempotencyRow | null {
  const row = stmtIdemGet.get(key) as Record<string, unknown> | undefined;
  if (!row) return null;
  return idemRowFromDb(row);
}

export function recordIdempotency(input: Omit<IdempotencyRow, "created_at">): void {
  stmtIdemInsert.run(
    input.key,
    input.user_id,
    input.request_hash,
    JSON.stringify(input.response),
    input.audit_id,
    nowIso(),
  );
}
