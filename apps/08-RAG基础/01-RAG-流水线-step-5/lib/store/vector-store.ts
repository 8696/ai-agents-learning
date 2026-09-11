/**
 * 职责：把切块行写成「一行四件套」。本步用 SQLite 存，不装 LanceDB。
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
  /** 仅 PDF 切块有值；Markdown 没有。命中卡片显示「第 N 页」用。 */
  page?: number;
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
      chunkIndex INTEGER NOT NULL,
      page INTEGER
    )
  `);
  // 老库（没 page 列）补一列；新库跳过
  try {
    db.exec("ALTER TABLE chunks ADD COLUMN page INTEGER");
  } catch {
    // 列已存在 → 静默跳过
  }
  return db;
}

function readRows(db: Database.Database): ChunkRow[] {
  const raw = db.prepare("SELECT id, vector, text, source, section, chunkIndex, page FROM chunks").all() as Array<{
    id: string;
    vector: string;
    text: string;
    source: string;
    section: string;
    chunkIndex: number;
    page: number | null;
  }>;
  return raw.map((row) => {
    const out: ChunkRow = {
      id: row.id,
      vector: JSON.parse(row.vector) as number[],
      text: row.text,
      source: row.source,
      section: row.section,
      chunkIndex: row.chunkIndex,
    };
    if (row.page !== null) out.page = row.page;
    return out;
  });
}

export async function overwriteChunks(rows: ChunkRow[]): Promise<number> {
  return withCall({
    scope: "│ 调用函数-overwriteChunks",
    kind: "函数",
    name: "overwriteChunks",
    explain: "首次拆库：清空再写入。step-2 起不推荐用，应该用 deleteBySource + addChunks 组合",
    args: { 行数: rows.length, 各行: rows },
    code: "DELETE FROM chunks; INSERT 每一行 id/vector/text/source/section/chunkIndex",
    run: async () => {
      const db = openDb();
      db.exec("DELETE FROM chunks");
      const insert = db.prepare(
        "INSERT INTO chunks (id, vector, text, source, section, chunkIndex, page) VALUES (@id, @vector, @text, @source, @section, @chunkIndex, @page)",
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
            page: row.page ?? null,
          });
        }
      });
      tx(rows);
      db.close();
      return rows.length;
    },
  });
}

/**
 * 按 source 字段整份删除（行级维护的最小操作）。
 * 上传同名文件 v2 时先调用这个，再 addChunks 新行 → 旧版不再被命中。
 */
export async function deleteBySource(source: string): Promise<number> {
  return withCall({
    scope: "│ 调用函数-deleteBySource",
    kind: "函数",
    name: "deleteBySource",
    explain: "按 source 字段删旧。docs 把该 source 的所有行整份删掉，不影响其它 source 的行。",
    args: { source },
    code: "DELETE FROM chunks WHERE source = ?",
    run: async () => {
      const db = openDb();
      const result = db.prepare("DELETE FROM chunks WHERE source = ?").run(source);
      db.close();
      return result.changes;
    },
  });
}

/**
 * 追加新行（不删旧）。和 deleteBySource 组合实现「按 source 先删后建」。
 */
export async function addChunks(rows: ChunkRow[]): Promise<number> {
  return withCall({
    scope: "│ 调用函数-addChunks",
    kind: "函数",
    name: "addChunks",
    explain: "追加新行。不删除任何已有行。和 deleteBySource 组合做按文件整份先删后建。",
    args: { 行数: rows.length, 各行: rows },
    code: "INSERT 每一行 id/vector/text/source/section/chunkIndex",
    run: async () => {
      if (rows.length === 0) return 0;
      const db = openDb();
      const insert = db.prepare(
        "INSERT INTO chunks (id, vector, text, source, section, chunkIndex, page) VALUES (@id, @vector, @text, @source, @section, @chunkIndex, @page)",
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
            page: row.page ?? null,
          });
        }
      });
      tx(rows);
      db.close();
      return rows.length;
    },
  });
}

/**
 * 列出库里所有不同 source，以及每个 source 的行数。
 * 用于 UI 显示「库里有 N 份来源」。
 */
export async function listSources(): Promise<Array<{ source: string; rowCount: number }>> {
  return withCall({
    scope: "│ 调用函数-listSources",
    kind: "函数",
    name: "listSources",
    explain: "按 source 分组统计行数。返回库里所有不同 source 的列表，前端展示「库里有几份文件」",
    args: {},
    code: "SELECT source, COUNT(*) AS n FROM chunks GROUP BY source",
    run: async () => {
      const db = openDb();
      const rows = db.prepare("SELECT source, COUNT(*) AS n FROM chunks GROUP BY source ORDER BY source").all() as Array<{ source: string; n: number }>;
      db.close();
      return rows.map((r) => ({ source: r.source, rowCount: r.n }));
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
    explain: "把 SQLite 里已经落盘的行读出来给页面看。不调嵌入、不调聊天。",
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
