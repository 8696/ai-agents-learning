/**
 * 职责：通用 KV 抽象层（§5.3.17）；DB 默认实现 = better-sqlite3；签名不变 → 换驱动业务零改动。
 * 数据流：routes/memory.ts（写入偏好）+ routes/chat.ts（注入 system 前读）→ kvGet/kvSet/kvList/kvDel → data/preferences.db。
 *
 * 为什么单独成文件：业务层（routes/*.ts）只认这 4 个函数；不直接 import better-sqlite3 / fs。
 *   未来换驱动（同步 → 异步如 node:sqlite / libsql）= 改这一个文件，routes 不动。
 *
 * 业务语义（本 demo）：kv 存「用户偏好」（language / no_marketing / ...）。
 *   userId = "default"（单用户 demo；接口第一个参数必须传，便于多用户 demo 复用）。
 *   文件名 = preferences.db（业务名归业务层；接口层 KV 抽象，不绑业务）。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_FILE = path.resolve(DATA_DIR, "preferences.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");   // §3 #6：禁止改 NORMAL/OFF
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (
    user_id    TEXT    NOT NULL,
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  CREATE INDEX IF NOT EXISTS idx_kv_user ON kv(user_id);
`);

// §3 #7：启动时跑 integrity_check
const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
if (integrity[0]?.integrity_check !== "ok") {
  db.close();
  fs.copyFileSync(DB_FILE, DB_FILE + ".bak");
  throw new Error(`preferences.db 损坏（integrity_check=${integrity[0]?.integrity_check}），已备份到 .bak，请删文件后重启`);
}

const stmtGet = db.prepare("SELECT value FROM kv WHERE user_id = ? AND key = ?");
const stmtUpsert = db.prepare(
  "INSERT INTO kv(user_id, key, value, updated_at) VALUES(?, ?, ?, ?) " +
  "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
);
const stmtDelete = db.prepare("DELETE FROM kv WHERE user_id = ? AND key = ?");
const stmtList = db.prepare("SELECT key, value FROM kv WHERE user_id = ?");

// 单用户 demo：userId 固定 "default"（§2 接口第一个参数必须传；多用户 demo 替换为从 ctx / cookie 拿）
const USER_ID = "default";

export async function kvGet(userId: string, key: string): Promise<unknown> {
  const row = stmtGet.get(userId, key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) : undefined;
}

export async function kvSet(userId: string, key: string, value: unknown): Promise<void> {
  // §3 #6：单条 UPSERT 用 prepare 即可；多步写才包 transaction
  stmtUpsert.run(userId, key, JSON.stringify(value), new Date().toISOString());
}

export async function kvDel(userId: string, key: string): Promise<void> {
  stmtDelete.run(userId, key); // 不存在 = no-op（DELETE 匹配 0 行不报错）
}

export async function kvList(userId: string): Promise<Record<string, unknown>> {
  const rows = stmtList.all(userId) as Array<{ key: string; value: string }>;
  const out: Record<string, unknown> = {};
  for (const { key, value } of rows) out[key] = JSON.parse(value);
  return out;
}

export { USER_ID };
