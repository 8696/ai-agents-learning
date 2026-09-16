/**
 * 职责：§5.3.17 KV 抽象层 —— kvGet / kvSet / kvDel / kvList。
 * 数据流：routes/*.ts + lib/flow/*.ts → 这里 4 个函数 → kv 表（SQLite）
 *
 * 接口是通用 KV 抽象（不绑业务），业务 schema 放在 kvSet 的 value JSON 里。
 * 接口签名不变 → 未来换驱动业务代码零改动。
 */
import { db, nowIso } from "./db.js";
import { logger } from "./logger.js";

const stmtGet    = db.prepare("SELECT value FROM kv WHERE user_id = ? AND key = ?");
const stmtUpsert = db.prepare(`INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
const stmtDelete = db.prepare("DELETE FROM kv WHERE user_id = ? AND key = ?");
const stmtList   = db.prepare("SELECT key, value FROM kv WHERE user_id = ?");

function rowToValue(row: { value: string } | undefined): unknown {
  if (!row) return undefined;
  try { return JSON.parse(row.value); } catch { return undefined; }
}

export async function kvGet(userId: string, key: string): Promise<unknown> {
  const t0 = Date.now();
  logger.info(
    "调用函数-kvGet",
    "调用函数开始：kvGet",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象；rollback 时按 userId + key 查当前值，与审计里记的 new_value 比对，库里已被人改过则拒绝撤回。",
    { 入参: { userId, key } },
  );
  const row = stmtGet.get(userId, key) as { value: string } | undefined;
  const value = rowToValue(row);
  logger.info(
    "调用函数-kvGet",
    "调用函数结束：kvGet",
    `为什么写这条日志：rollback 需要「当前值是否还等于审计时记的 new_value」决定能否撤回。当前：命中 = ${Boolean(row)}。`,
    { 返回值: { found: Boolean(row), value }, 耗时ms: Date.now() - t0 },
  );
  return value;
}

export async function kvSet(userId: string, key: string, value: unknown): Promise<void> {
  const t0 = Date.now();
  logger.info(
    "调用函数-kvSet",
    "调用函数开始：kvSet",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象；writeWithIdempotency 写入库时调，同 key 重复 kvSet = 整体覆盖。",
    { 入参: { userId, key, value } },
  );
  const json = JSON.stringify(value);
  stmtUpsert.run(userId, key, json, nowIso());
  logger.info(
    "调用函数-kvSet",
    "调用函数结束：kvSet",
    "为什么写这条日志：要让调用方知道写入库完成。",
    { 返回值: { userId, key, value }, 耗时ms: Date.now() - t0 },
  );
}

export async function kvDel(userId: string, key: string): Promise<void> {
  const t0 = Date.now();
  logger.info(
    "调用函数-kvDel",
    "调用函数开始：kvDel",
    "为什么写这条日志：rollback action=NEW（oldValue=null）时反着删这条。",
    { 入参: { userId, key } },
  );
  const r = stmtDelete.run(userId, key);
  logger.info(
    "调用函数-kvDel",
    "调用函数结束：kvDel",
    `为什么写这条日志：让调用方知道真删了多少行。当前：changes = ${r.changes}。`,
    { 返回值: { changes: r.changes }, 耗时ms: Date.now() - t0 },
  );
}

export async function kvList(userId: string): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  logger.info(
    "调用函数-kvList",
    "调用函数开始：kvList",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象；前端 library 面板实时显示库里事实。",
    { 入参: { userId } },
  );
  const rows = stmtList.all(userId) as Array<{ key: string; value: string }>;
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.key] = rowToValue(row);
  logger.info(
    "调用函数-kvList",
    "调用函数结束：kvList",
    `为什么写这条日志：让前端 library 面板显示条数变化。当前：共 ${rows.length} 条。`,
    { 返回值: out, 耗时ms: Date.now() - t0 },
  );
  return out;
}
