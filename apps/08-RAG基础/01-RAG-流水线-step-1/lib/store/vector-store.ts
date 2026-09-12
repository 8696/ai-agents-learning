/**
 * 职责：把切块行写成「一行向量库一行要存的四个字段」。本步用 SQLite 存，不装 LanceDB。
 * 教学点是行结构，不是某一家向量库 API。检索对这几行做余弦排序。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { withCall } from "../log/with-call.js";

export type ChunkRow = {
  id: string;
  vector: number[];
  text: string;
  source: string;
  section: string;
  chunkIndex: number;
};

export type HitRow = ChunkRow & { score: number; distance: number };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const DB_FILE = path.join(DATA_DIR, "chunks.db");

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function openDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      vector TEXT NOT NULL,
      text TEXT NOT NULL,
      source TEXT NOT NULL,
      section TEXT NOT NULL,
      chunkIndex INTEGER NOT NULL
    )
  `);
  return db;
}

function readRows(db: Database.Database): ChunkRow[] {
  const raw = db.prepare("SELECT id, vector, text, source, section, chunkIndex FROM chunks").all() as Array<{
    id: string;
    vector: string;
    text: string;
    source: string;
    section: string;
    chunkIndex: number;
  }>;
  return raw.map((row) => ({
    id: row.id,
    vector: JSON.parse(row.vector) as number[],
    text: row.text,
    source: row.source,
    section: row.section,
    chunkIndex: row.chunkIndex,
  }));
}

export async function overwriteChunks(rows: ChunkRow[]): Promise<number> {
  return withCall({
    scope: "│ 调用函数-overwriteChunks",
    kind: "函数",
    name: "overwriteChunks",
    explain: "首次拆库：清空再写入。入门不做按文件删旧。",
    args: { 行数: rows.length, 各行: rows },
    code: "DELETE FROM chunks; INSERT 每一行 id/vector/text/source/section/chunkIndex",
    run: async () => {
      const db = openDb();
      db.exec("DELETE FROM chunks");
      const insert = db.prepare(
        "INSERT INTO chunks (id, vector, text, source, section, chunkIndex) VALUES (@id, @vector, @text, @source, @section, @chunkIndex)",
      );
      const tx = db.transaction((list: ChunkRow[]) => {
        for (const row of list) {
          insert.run({
            id: row.id,
            vector: JSON.stringify(row.vector),
            text: row.text,
            source: row.source,
            section: row.section,
            chunkIndex: row.chunkIndex,
          });
        }
      });
      tx(rows);
      db.close();
      return rows.length;
    },
  });
}

export async function countChunks(): Promise<number> {
  return withCall({
    scope: "│ 调用函数-countChunks",
    kind: "函数",
    name: "countChunks",
    explain: "提问前先看库里有没有行。0 行就不能装成已经拆过库。",
    args: {},
    code: "SELECT COUNT(*) FROM chunks",
    run: async () => {
      const db = openDb();
      const row = db.prepare("SELECT COUNT(*) AS n FROM chunks").get() as { n: number };
      db.close();
      return row.n;
    },
  });
}

export async function listChunks(): Promise<ChunkRow[]> {
  return withCall({
    scope: "│ 调用函数-listChunks",
    kind: "函数",
    name: "listChunks",
    explain: "把 SQLite 里已经写入数据库的行读出来给页面看。不调嵌入、不调聊天。",
    args: { dbFile: DB_FILE },
    code: "SELECT id, vector, text, source, section, chunkIndex FROM chunks",
    run: async () => {
      const db = openDb();
      const rows = readRows(db);
      db.close();
      return rows;
    },
  });
}

export async function searchChunks(queryVector: number[], topK: number): Promise<HitRow[]> {
  return withCall({
    scope: "│ 调用函数-searchChunks",
    kind: "函数",
    name: "searchChunks",
    explain: "入门库很小，精确算余弦再取前 K 条。库大了才换成近似最近邻（ANN）。",
    args: { topK, queryVector },
    code: "读出全部行，按余弦相似度排序，取前 K",
    run: async () => {
      const db = openDb();
      const rows = readRows(db);
      db.close();
      return rows
        .map((row) => {
          const score = cosine(queryVector, row.vector);
          return { ...row, score, distance: 1 - score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
  });
}
