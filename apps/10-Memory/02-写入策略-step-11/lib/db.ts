/**
 * 职责：本 Demo 的持久化抽象层（§5.3.17）。
 * 数据流：routes/*.ts → kvGet / kvSet / kvDel / kvList → data/facts.db（SQLite via better-sqlite3）。
 *
 * 接口是通用 KV 抽象（不绑业务），业务 schema（key / value / type / confidence / source / validUntil）
 * 放在 kvSet 调用的 value JSON 里。接口签名不变 → 未来换驱动（同步 → 异步如 node:sqlite / libsql）
 * 业务代码零改动，只动这一个文件。
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
    user_id             TEXT    NOT NULL,
    key                 TEXT    NOT NULL,
    value               TEXT    NOT NULL,    -- JSON.stringify；业务传啥存啥
    updated_at          TEXT    NOT NULL,    -- ISO 8601；入库即第一次"用"
    archived_at         TEXT,                -- ISO 8601；NULL = 未归档；非 NULL = 已写 archived_at（变体 6-B 过期 + 变体 6 关键区分「过期 ≠ 删除」）
    last_used_at        TEXT,                -- ISO 8601；NULL = 从未用过；非 NULL = 最近一次被 recall 并使用的时间（变体 6-C 衰减）
    use_count           INTEGER DEFAULT 0,  -- 被 recall 次数；用于衰减公式的 log 项（变体 6-C）
    importance          TEXT,                -- 模型评分：critical | important | casual | throwaway；NULL = 未评估
    importance_reasoning TEXT,               -- 模型评分理由（一句话）
    PRIMARY KEY (user_id, key)
  );
  CREATE INDEX IF NOT EXISTS idx_kv_user ON kv(user_id);
`);

// §5.3.17 #7：启动时 integrity_check；不通过时抛错（生产应备份 .bak + 重建 + 抛错）
const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
if (integrity[0]?.integrity_check !== "ok") {
  throw new Error(`SQLite 完整性检查失败：${JSON.stringify(integrity)}`);
}

// §5.3.17 兼容：step-9 跑过的库可能缺新字段，启动时 ALTER TABLE 加上（SQLite 加列有默认值/可空才行）
const cols = db.pragma("table_info(kv)") as Array<{ name: string }>;
const colNames = new Set(cols.map(function (c) { return c.name; }));
if (!colNames.has("archived_at")) {
  db.exec("ALTER TABLE kv ADD COLUMN archived_at TEXT");
}
if (!colNames.has("last_used_at")) {
  db.exec("ALTER TABLE kv ADD COLUMN last_used_at TEXT");
}
if (!colNames.has("use_count")) {
  db.exec("ALTER TABLE kv ADD COLUMN use_count INTEGER DEFAULT 0");
}
if (!colNames.has("importance")) {
  db.exec("ALTER TABLE kv ADD COLUMN importance TEXT");
}
if (!colNames.has("importance_reasoning")) {
  db.exec("ALTER TABLE kv ADD COLUMN importance_reasoning TEXT");
}

const stmtGet    = db.prepare("SELECT value FROM kv WHERE user_id = ? AND key = ?");
const stmtUpsert  = db.prepare(`INSERT INTO kv (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
const stmtDelete  = db.prepare("DELETE FROM kv WHERE user_id = ? AND key = ?");
const stmtList    = db.prepare("SELECT key, value FROM kv WHERE user_id = ?");

/** 给 lib/flow/expiration.ts 用的 db 句柄（同进程同连接；better-sqlite3 同步安全） */
export const kvDb = db;

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

export async function kvGet(userId: string, key: string): Promise<unknown> {
  logger.info(
    "调用函数-kvGet",
    "调用函数开始：kvGet",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象，业务不直接 new Database；这一步用于 dedupByKey 按 candidate.key 查事实库。当前：准备按 userId + key 查一条。",
    { 入参: { userId, key }, __code: "const row = stmtGet.get(userId, key);" },
  );

  const t0 = Date.now();
  const row = stmtGet.get(userId, key) as { value: string } | undefined;
  const value = rowToValue(row);

  logger.info(
    "调用函数-kvGet",
    "调用函数结束：kvGet",
    `为什么写这条日志：要让 dedupByKey 知道库里是否有同 key + 同 value（字面完全相同 → NOOP）。当前：查询完成，命中 = ${Boolean(row)}。`,
    { 返回值: { found: Boolean(row), value }, 耗时ms: Date.now() - t0, 字段释义: {
      "found": "true = 库里已有同 key；false = 库里没有",
      "value": "库里存的 value JSON 反序列化结果（业务层按 schema 取字段）",
    } },
  );

  return value;
}

export async function kvSet(userId: string, key: string, value: unknown): Promise<void> {
  logger.info(
    "调用函数-kvSet",
    "调用函数开始：kvSet",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象，同 key 重复 kvSet = 整体覆盖；这一步用于 confirm [记住] 后把事实落盘。当前：准备把业务 value JSON 写入 kv 表。",
    { 入参: { userId, key, value }, __code: "stmtUpsert.run(userId, key, JSON.stringify(value), nowIso());" },
  );

  const t0 = Date.now();
  const json = JSON.stringify(value);
  stmtUpsert.run(userId, key, json, nowIso());

  logger.info(
    "调用函数-kvSet",
    "调用函数结束：kvSet",
    "为什么写这条日志：要记下这次落盘的事实 + 写入耗时，方便排查「这条什么时候进的事实库」。当前：写入完成。",
    { 返回值: { userId, key, value }, 耗时ms: Date.now() - t0 },
  );
}

export async function kvDel(userId: string, key: string): Promise<void> {
  logger.info(
    "调用函数-kvSet",
    "调用函数开始：kvDel",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象，不存在 = no-op，不抛错。当前：准备删 userId + key。",
    { 入参: { userId, key }, __code: "const r = stmtDelete.run(userId, key);" },
  );

  const t0 = Date.now();
  const r = stmtDelete.run(userId, key);

  logger.info(
    "调用函数-kvDel",
    "调用函数结束：kvDel",
    `为什么写这条日志：要让调用方知道是否真删了（changes 字段）。当前：删除完成，影响行数 = ${r.changes}。`,
    { 返回值: { changes: r.changes }, 耗时ms: Date.now() - t0, 字段释义: {
      "changes": "0 = 库里没这条；1 = 真删了一条",
    } },
  );
}

export async function kvList(userId: string): Promise<Record<string, unknown>> {
  logger.info(
    "调用函数-kvList",
    "调用函数开始：kvList",
    "为什么写这条日志：§5.3.17 接口层通用 KV 抽象，把库里该 user 的事实全部读出给页面展示，方便对照查重是否生效。当前：准备按 userId 列。",
    { 入参: { userId }, __code: "const rows = stmtList.all(userId);" },
  );

  const t0 = Date.now();
  const rows = stmtList.all(userId) as Array<{ key: string; value: string }>;
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    out[row.key] = rowToValue(row);
  }

  logger.info(
    "调用函数-kvList",
    "调用函数结束：kvList",
    `为什么写这条日志：要让页面顶部「事实库已有 N 条」实时显示，方便看到去重是否真的生效（同原文 + 同样分档点两次 [记住]，N 应该不变）。当前：列出完成，共 ${rows.length} 条。`,
    { 返回值: out, 耗时ms: Date.now() - t0 },
  );

  return out;
}