/**
 * 职责：本 Demo 的持久化抽象层（§5.3.17）— KV 核心。
 * 数据流：routes/*.ts → kvGet / kvSet / kvSoftDelete / kvDel / kvList → data/facts.db（SQLite via better-sqlite3）。
 *
 * step-8 第 5 关「冲突与更新」在 step-7（第 4 关「去重」）事实库之上扩展：
 *   - kv 表加 deleted_at 字段（NULL = 未删；非 NULL = 软删除时间）
 *
 * 接口是通用 KV 抽象（不绑业务），业务 schema 放在 kvSet 调用的 value JSON 里。
 * 接口签名：kvGet / kvSet / kvSoftDelete / kvDel / kvList；历史相关函数（kvTrash / kvRecordHistory / kvHistory）
 * 拆到 lib/history-store.ts，避免本文件超过 §5.3.8 文件行数硬上限（≤280）。
 *
 * 默认实现：SQLite（better-sqlite3 同步 API + 包 async），文件落在 data/facts.db。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Database from "better-sqlite3";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_FILE = path.resolve(DATA_DIR, "facts.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL"); // §5.3.17 #6：禁止改 NORMAL/OFF（断电 / 崩溃时丢数据）
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    user_id    TEXT    NOT NULL,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,    -- JSON.stringify；业务传啥存啥
    updated_at TEXT    NOT NULL,    -- ISO 8601
    deleted_at TEXT,                -- ISO 8601；NULL = 未删；非 NULL = 软删除时间（变体 5-C）
    PRIMARY KEY (user_id, key)
  );
  CREATE INDEX IF NOT EXISTS idx_kv_user ON kv(user_id);
`);

// fact_history 表也在这里建——拆文件不拆数据库（schema 一起初始化）
db.exec(`
  CREATE TABLE IF NOT EXISTS fact_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT    NOT NULL,
    fact_key        TEXT    NOT NULL,
    action          TEXT    NOT NULL,    -- 'update' | 'merge' | 'delete'（noop / new 不进历史）
    old_value       TEXT,                -- JSON
    new_value       TEXT,                -- JSON
    source_session  TEXT,                -- 来源会话 id（演示用固定 'demo-session'）
    source_msg_seq  INTEGER,             -- 来源消息序号（演示用 0）
    created_at      TEXT    NOT NULL     -- ISO 8601
  );
  CREATE INDEX IF NOT EXISTS idx_fact_history_user_key ON fact_history(user_id, fact_key);
`);

// §5.3.17 #7：启动时 integrity_check；不通过时抛错（生产应备份 .bak + 重建 + 抛错）
const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
if (integrity[0]?.integrity_check !== "ok") {
  throw new Error(`SQLite 完整性检查失败：${JSON.stringify(integrity)}`);
}

const stmtGet        = db.prepare("SELECT value, deleted_at FROM kv WHERE user_id = ? AND key = ?");
const stmtUpsert     = db.prepare(`INSERT INTO kv (user_id, key, value, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)
  ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted_at = NULL`);
const stmtSoftDelete = db.prepare("UPDATE kv SET deleted_at = ? WHERE user_id = ? AND key = ?");
const stmtHardDelete = db.prepare("DELETE FROM kv WHERE user_id = ? AND key = ?");
const stmtList       = db.prepare("SELECT key, value, updated_at, deleted_at FROM kv WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC");

function rowToValue(row: { value: string } | undefined): unknown {
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

/** kvGet 返回补 deleted_at 字段，让冲突解析主流程能区分「不存在 / 软删除 / 存在」 */
export interface KvGetResult {
  value: unknown;
  deletedAt: string | null;
}

export async function kvGet(userId: string, key: string): Promise<KvGetResult | undefined> {
  logger.info(
    "调用函数-kvGet",
    "调用函数开始：kvGet",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象；step-8 这一步用于 resolveConflict 按 candidate.key 查事实库 + 看是否软删除（变体 5-C）。当前：准备按 userId + key 查一条。",
    { 入参: { userId, key }, __code: "const row = stmtGet.get(userId, key);" },
  );

  const t0 = Date.now();
  const row = stmtGet.get(userId, key) as { value: string; deleted_at: string | null } | undefined;
  if (!row) {
    logger.info(
      "调用函数-kvGet",
      "调用函数结束：kvGet",
      "为什么写这条日志：让 resolveConflict 知道这条 key 库里没有，action = NEW。当前：查询完成，未命中。",
      { 返回值: { found: false }, 耗时ms: Date.now() - t0, 字段释义: { "found": "false = 库里没这条 key" } },
    );
    return undefined;
  }
  const result: KvGetResult = { value: rowToValue(row), deletedAt: row.deleted_at };
  logger.info(
    "调用函数-kvGet",
    "调用函数结束：kvGet",
    `为什么写这条日志：让 resolveConflict 知道这条 key 库里状态——存在 / 软删除，决定走 UPDATE / MERGE（复活）/ NOOP。当前：查询完成，命中 + deletedAt = ${row.deleted_at ?? "NULL"}。`,
    { 返回值: { found: true, value: result.value, deletedAt: result.deletedAt }, 耗时ms: Date.now() - t0, 字段释义: {
      "found": "true = 库里已有这条 key",
      "deletedAt": "null = 存在但未删除；非 null = 软删除时间（ISO 8601）",
    } },
  );
  return result;
}

export async function kvSet(userId: string, key: string, value: unknown): Promise<void> {
  logger.info(
    "调用函数-kvSet",
    "调用函数开始：kvSet",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象，同 key 重复 kvSet = 整体覆盖 + 清掉 deleted_at（变体 5-A 复活旧 key）；这一步用于 resolveConflict 的 NEW / UPDATE / MERGE 三个动作。当前：准备把业务 value JSON 写入 kv 表。",
    { 入参: { userId, key, value }, __code: "stmtUpsert.run(userId, key, JSON.stringify(value), nowIso());" },
  );

  const t0 = Date.now();
  const json = JSON.stringify(value);
  stmtUpsert.run(userId, key, json, nowIso());

  logger.info(
    "调用函数-kvSet",
    "调用函数结束：kvSet",
    "为什么写这条日志：要记下这次写入事实库的事实 + 写入耗时，方便排查「这条什么时候进的事实库」。当前：写入完成，deleted_at 已置 NULL（复活旧 key 也走这条）。",
    { 返回值: { userId, key, value }, 耗时ms: Date.now() - t0 },
  );
}

/** 软删除：变体 5-C 默认删除路径——不动磁盘，召回自动排除；事实 + 历史还在 */
export async function kvSoftDelete(userId: string, key: string): Promise<{ changes: number }> {
  logger.info(
    "调用函数-kvSoftDelete",
    "调用函数开始：kvSoftDelete",
    "为什么写这条日志：变体 5-C 软删除路径——只把 deleted_at 设为当前时间，物理行 + 历史版本保留。当前：准备 UPDATE kv SET deleted_at = now。",
    { 入参: { userId, key }, __code: "const r = stmtSoftDelete.run(nowIso(), userId, key);" },
  );

  const t0 = Date.now();
  const r = stmtSoftDelete.run(nowIso(), userId, key);

  logger.info(
    "调用函数-kvSoftDelete",
    "调用函数结束：kvSoftDelete",
    `为什么写这条日志：要让调用方知道是否真软删了（changes 字段）。当前：更新完成，影响行数 = ${r.changes}。`,
    { 返回值: { changes: r.changes }, 耗时ms: Date.now() - t0, 字段释义: {
      "changes": "0 = 库里没这条（不会创建）；1 = 软删除完成",
    } },
  );
  return { changes: r.changes };
}

/** 真删：变体 5 的「真删」分支；本页 mode-soft-delete 只演示软删，不演示真删 */
export async function kvDel(userId: string, key: string): Promise<{ changes: number }> {
  logger.info(
    "调用函数-kvDel",
    "调用函数开始：kvDel",
    "为什么写这条日志：变体 5 的「真删」分支（页面没接，仅保留接口给未来真删按钮）。当前：准备 DELETE FROM kv。",
    { 入参: { userId, key }, __code: "const r = stmtHardDelete.run(userId, key);" },
  );

  const t0 = Date.now();
  const r = stmtHardDelete.run(userId, key);

  logger.info(
    "调用函数-kvDel",
    "调用函数结束：kvDel",
    `为什么写这条日志：要让调用方知道是否真删了。当前：删除完成，影响行数 = ${r.changes}。`,
    { 返回值: { changes: r.changes }, 耗时ms: Date.now() - t0 },
  );
  return { changes: r.changes };
}

export async function kvList(userId: string): Promise<Record<string, unknown>> {
  logger.info(
    "调用函数-kvList",
    "调用函数开始：kvList",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象；step-8 这一步用于页面顶部「事实库已有 N 条」实时显示（默认排除软删除）。当前：准备按 userId 列未软删的事实。",
    { 入参: { userId }, __code: "const rows = stmtList.all(userId);" },
  );

  const t0 = Date.now();
  const rows = stmtList.all(userId) as Array<{ key: string; value: string; updated_at: string; deleted_at: string | null }>;
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    out[row.key] = rowToValue(row);
  }

  logger.info(
    "调用函数-kvList",
    "调用函数结束：kvList",
    `为什么写这条日志：要让页面顶部「事实库已有 N 条」实时显示，方便看到 UPDATE / MERGE / DELETE 动作后条数 / 内容变化。当前：列出完成（已排除软删除），共 ${rows.length} 条。`,
    { 返回值: out, 耗时ms: Date.now() - t0 },
  );

  return out;
}

/** 给 history-store.ts 用的 db 句柄（同进程同连接；better-sqlite3 同步安全） */
export const kvDb = db;
