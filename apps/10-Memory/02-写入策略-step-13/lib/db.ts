/**
 * 职责：本 Demo 的持久化抽象层（§5.3.17）—— DB 实例 + 三张表的 schema + integrity_check。
 * 数据流：routes/*.ts + lib/store-*.ts + lib/flow/*.ts → 共享这一个 db 句柄
 *        → data/facts.db（SQLite via better-sqlite3）
 *
 * 三张表：
 *   - kv：通用 KV 抽象（业务 schema 在 kvSet 的 value JSON 里）—— 见 lib/store-kv.ts
 *   - audit_log：每次写入（NEW / UPDATE / MERGE / DELETE / NOOP / BLOCKED）落一行 —— 见 lib/store-audit.ts
 *   - idempotency_keys：写入幂等键，重复同 key 直接返前次响应 —— 见 lib/store-idempotent.ts
 *
 * 接口是通用 KV 抽象（不绑业务）。接口签名不变 → 未来换驱动（同步 → 异步如 node:sqlite / libsql）业务代码零改动，只动这一个文件。
 * 默认实现：SQLite（better-sqlite3 同步 API + 包 async），文件落在 data/facts.db。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_FILE = path.resolve(DATA_DIR, "facts.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL"); // §5.3.17 #6：禁止改 NORMAL/OFF（断电 / 崩溃时丢数据）
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    user_id     TEXT    NOT NULL,
    key         TEXT    NOT NULL,
    value       TEXT    NOT NULL,    -- JSON.stringify；业务传啥存啥
    updated_at  TEXT    NOT NULL,    -- ISO 8601
    PRIMARY KEY (user_id, key)
  );
  CREATE INDEX IF NOT EXISTS idx_kv_user ON kv(user_id);

  CREATE TABLE IF NOT EXISTS audit_log (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id              TEXT    NOT NULL,
    action               TEXT    NOT NULL,    -- NEW | UPDATE | MERGE | DELETE | NOOP | BLOCKED
    key                  TEXT    NOT NULL,
    old_value            TEXT,                -- JSON 字符串；NULL = 库里之前没有
    new_value            TEXT,                -- JSON 字符串；NULL = 这次没写
    source_session_id    TEXT,                -- 来源会话 ID（演示用，给一个固定的 demo-session）
    source_message_index INTEGER,             -- 在该会话里的消息序号（演示用，0/1/2/...）
    confidence           REAL,                -- 模型给的置信度（[0, 1]）
    idempotency_key      TEXT,                -- 写入幂等键；NULL = 没带幂等
    created_at           TEXT    NOT NULL,    -- ISO 8601
    rolled_back_at       TEXT                 -- ISO 8601；非 NULL = 已撤回
  );
  CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_audit_key ON audit_log(user_id, key);

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key          TEXT    PRIMARY KEY,         -- 客户端传的 idempotencyKey（UUID）
    user_id      TEXT    NOT NULL,
    request_hash TEXT    NOT NULL,            -- 整个请求体的 SHA-256；不同请求体用同 key → 409
    response     TEXT    NOT NULL,            -- 第一次的完整 response JSON
    audit_id     INTEGER,                     -- 第一次对应的 audit_log.id
    created_at   TEXT    NOT NULL             -- ISO 8601
  );
  CREATE INDEX IF NOT EXISTS idx_idem_user ON idempotency_keys(user_id, created_at);
`);

// §5.3.17 #7：启动时 integrity_check；不通过时抛错（生产应备份 .bak + 重建 + 抛错）
const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
if (integrity[0]?.integrity_check !== "ok") {
  throw new Error(`SQLite 完整性检查失败：${JSON.stringify(integrity)}`);
}

/** 给 lib/store-*.ts 共用同进程同连接（better-sqlite3 同步安全） */
export const kvDb = db;

/** 给 lib/store-*.ts 共用：nowIso + rowToValue 等小工具 */
export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJsonField<T>(s: string | null): T | null {
  if (s === null) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}
