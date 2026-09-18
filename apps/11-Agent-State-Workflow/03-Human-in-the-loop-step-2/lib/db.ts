/**
 * 职责：通用 KV 抽象层；DB 默认实现 = better-sqlite3；签名不变 → 未来换驱动业务零改动。
 * 数据流：routes/*.ts / lib/flow/*.ts → kvGet / kvSet / kvDel / kvList → data/transfers.db。
 * 为什么单独成文件：业务不直接读 data/，不直接 new Database；换驱动、加表 / 字段、加缓存层 = 改这一个文件。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const DB_FILE = path.resolve(DATA_DIR, "transfers.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");
db.exec(
  `CREATE TABLE IF NOT EXISTS kv (
     user_id    TEXT    NOT NULL,
     key        TEXT    NOT NULL,
     value      TEXT    NOT NULL,
     updated_at TEXT    NOT NULL,
     PRIMARY KEY (user_id, key)
   );
   CREATE INDEX IF NOT EXISTS idx_kv_user ON kv(user_id);`,
);

const integrity = db.pragma("integrity_check") as { integrity_check: string }[];
if (integrity[0]?.integrity_check !== "ok") {
  fs.copyFileSync(DB_FILE, DB_FILE + ".bak");
  db.exec(`DROP TABLE IF EXISTS kv;`);
  db.exec(
    `CREATE TABLE kv (
       user_id    TEXT    NOT NULL,
       key        TEXT    NOT NULL,
       value      TEXT    NOT NULL,
       updated_at TEXT    NOT NULL,
       PRIMARY KEY (user_id, key)
     );
     CREATE INDEX idx_kv_user ON kv(user_id);`,
  );
  throw new Error("SQLite integrity_check 失败；已备份为 .bak 并重建空表，请重试。");
}

const stmtGet = db.prepare("SELECT value FROM kv WHERE user_id = ? AND key = ?");
const stmtUpsert = db.prepare(
  `INSERT INTO kv (user_id, key, value, updated_at)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
);
const stmtDelete = db.prepare("DELETE FROM kv WHERE user_id = ? AND key = ?");
const stmtList = db.prepare("SELECT key, value FROM kv WHERE user_id = ?");

export async function kvGet(userId: string, key: string): Promise<unknown> {
  const row = stmtGet.get(userId, key) as { value: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

export async function kvSet(userId: string, key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  stmtUpsert.run(userId, key, json, new Date().toISOString());
}

export async function kvDel(userId: string, key: string): Promise<void> {
  stmtDelete.run(userId, key);
}

export async function kvList(userId: string): Promise<Record<string, unknown>> {
  const rows = stmtList.all(userId) as { key: string; value: string }[];
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = undefined;
    }
  }
  return out;
}
