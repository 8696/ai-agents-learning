/**
 * 职责：fact_history 表 + kv 表「已删除」视图的查询 / 写入接口。
 * 数据流：routes/*.ts → kvTrash / kvRecordHistory / kvHistory → data/facts.db（复用 lib/db.ts 的 kvDb 句柄）。
 *
 * 为什么拆出来：lib/db.ts 的 KV 核心（kvGet / kvSet / kvSoftDelete / kvDel / kvList）已 200+ 行；
 * 历史相关三个函数再加 ~130 行会撞 §5.3.8 文件行数硬上限（≤280）。
 * KV 抽象接口签名（kvGet / kvSet / kvSoftDelete / kvDel / kvList）不变；历史相关走本文件。
 *
 * schema 在 lib/db.ts 启动时一次性建好；本文件只持有 history 表的 prepared statement 和导出函数。
 */
import { kvDb } from "./db.js";
import { logger } from "./logger.js";

const stmtListTrash  = kvDb.prepare("SELECT key, value, updated_at, deleted_at FROM kv WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC");
const stmtInsertHist = kvDb.prepare(`INSERT INTO fact_history (user_id, fact_key, action, old_value, new_value, source_session, source_msg_seq, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const stmtSelectHist = kvDb.prepare(`SELECT id, action, old_value, new_value, source_session, source_msg_seq, created_at
  FROM fact_history WHERE user_id = ? AND fact_key = ? ORDER BY id ASC`);

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

export async function kvTrash(userId: string): Promise<Record<string, unknown>> {
  logger.info(
    "调用函数-kvTrash",
    "调用函数开始：kvTrash",
    "为什么写这条日志：变体 5-C「已删除」视图——只列软删除的事实（deleted_at IS NOT NULL）。当前：准备按 userId 列软删除的事实。",
    { 入参: { userId }, __code: "const rows = stmtListTrash.all(userId);" },
  );

  const t0 = Date.now();
  const rows = stmtListTrash.all(userId) as Array<{ key: string; value: string; updated_at: string; deleted_at: string | null }>;
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    out[row.key] = rowToValue(row);
  }

  logger.info(
    "调用函数-kvTrash",
    "调用函数结束：kvTrash",
    `为什么写这条日志：要让页面「已删除」视图看到软删除的事实 + deleted_at 时间，方便验收 ④。当前：列出完成，共 ${rows.length} 条。`,
    { 返回值: out, 耗时ms: Date.now() - t0 },
  );

  return out;
}

/** 写一条历史（变体 5 · 旧值去向 · 进历史版本） */
export interface HistoryWriteArgs {
  userId: string;
  factKey: string;
  action: "update" | "merge" | "delete";
  oldValue: unknown;
  newValue: unknown;
  sourceSession: string;
  sourceMsgSeq: number;
}

export async function kvRecordHistory(args: HistoryWriteArgs): Promise<void> {
  logger.info(
    "调用函数-kvRecordHistory",
    "调用函数开始：kvRecordHistory",
    "为什么写这条日志：变体 5「旧值去向 · 进历史」——把这次写入前的旧值 + 写入后的新值 + 来源塞 fact_history 表，方便审计 / 撤回 / 验收 ③。当前：准备 INSERT INTO fact_history。",
    { 入参: args, __code: "stmtInsertHist.run(userId, factKey, action, JSON.stringify(oldValue), JSON.stringify(newValue), sourceSession, sourceMsgSeq, nowIso());" },
  );

  const t0 = Date.now();
  stmtInsertHist.run(
    args.userId,
    args.factKey,
    args.action,
    JSON.stringify(args.oldValue ?? null),
    JSON.stringify(args.newValue ?? null),
    args.sourceSession,
    args.sourceMsgSeq,
    nowIso(),
  );

  logger.info(
    "调用函数-kvRecordHistory",
    "调用函数结束：kvRecordHistory",
    "为什么写这条日志：要让 history API 能 SELECT 出完整变更链。当前：写入完成。",
    { 返回值: { factKey: args.factKey, action: args.action }, 耗时ms: Date.now() - t0 },
  );
}

/** 读一条事实的完整历史版本（验收 ③：点开任一条事实能看见历史） */
export interface HistoryEntry {
  id: number;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  sourceSession: string;
  sourceMsgSeq: number;
  createdAt: string;
}

export async function kvHistory(userId: string, factKey: string): Promise<HistoryEntry[]> {
  logger.info(
    "调用函数-kvHistory",
    "调用函数开始：kvHistory",
    "为什么写这条日志：变体 5「旧值去向 · 进历史」的反向查询——给 mode-history sub-page 用，把某条事实的完整变更链（含 OLD / NEW / 时间）展示给用户。当前：准备按 userId + fact_key 查 fact_history。",
    { 入参: { userId, factKey }, __code: "const rows = stmtSelectHist.all(userId, factKey);" },
  );

  const t0 = Date.now();
  const rows = stmtSelectHist.all(userId, factKey) as Array<{
    id: number;
    action: string;
    old_value: string;
    new_value: string;
    source_session: string;
    source_msg_seq: number;
    created_at: string;
  }>;
  const out: HistoryEntry[] = rows.map(r => ({
    id: r.id,
    action: r.action,
    oldValue: r.old_value ? JSON.parse(r.old_value) : null,
    newValue: r.new_value ? JSON.parse(r.new_value) : null,
    sourceSession: r.source_session,
    sourceMsgSeq: r.source_msg_seq,
    createdAt: r.created_at,
  }));

  logger.info(
    "调用函数-kvHistory",
    "调用函数结束：kvHistory",
    `为什么写这条日志：要让页面点开历史版本时看到完整变更链。当前：查询完成，共 ${out.length} 条。`,
    { 返回值: out, 耗时ms: Date.now() - t0 },
  );

  return out;
}
