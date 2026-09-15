/**
 * 职责：本步核心——第 6 关「过期」= 时间 / 衰减 / 归档。
 * 数据流：
 *   - scanForExpired 扫库,把 validUntil < asOf 的事实写 archived_at(满足需求 6 验收 ①)
 *   - computeDecayWeight 算每条事实的衰减权重(满足需求 6 验收 ③)
 *   - recallWithDecay 按衰减权重排序 + 命中后更新 last_used_at + use_count += 1
 *
 * 为什么单独成文件：第 6 关「过期」是笔记独立写过的四种变体之一,集中放一个文件。
 * route 层 routes/recall.ts 只调 recallWithDecay；routes/time-skip.ts 只调 scanForExpired。
 *
 * 设计：
 *   - "现在"是参数 asOf（demo 用服务端"系统时间 + timeOffsetMs"模拟时间流逝；生产里直接 Date.now()）。
 *   - 过期 ≠ 删除：归档只是写 archived_at；物理行 + 历史版本都还在（满足笔记 §6 「关键区分」）。
 *   - 衰减公式：weight = (1 + log(use_count + 1)) / (1 + (asOf - last_used_at)天 / 30)。
 *     含义：用过的比没用的权重高（log 项）；越久没用的权重越低（衰减项）；half-life = 30 天。
 *     永未用过的：last_used_at = updated_at（把"入库"当成"第一次用"）。
 */
import { kvDb } from "../db.js";
import { logger } from "../logger.js";
import { HALF_LIFE_DAYS_BY_IMPORTANCE, type ImportanceLevel } from "./score-importance.js";

// ── 服务端"系统时间"模拟（demo 用，生产去掉） ──
let timeOffsetMs = 0;

export function setTimeOffset(ms: number): void {
  timeOffsetMs = ms;
}

export function getNowIso(): string {
  return new Date(Date.now() + timeOffsetMs).toISOString();
}

/** asOf 参数直接接受 ISO 字符串；本步所有"现在"都走这个函数，time-skip 后用同一个函数即可生效 */
export function getAsOf(): string {
  return getNowIso();
}

// ── 6-B：扫描过期 → 归档 ──
export interface ScanResult {
  scanned: number;
  archived: number;
  archivedKeys: string[];
}

interface KvRow {
  key: string;
  value: string;
  updated_at: string;
  archived_at: string | null;
  last_used_at: string | null;
  use_count: number | null;
  importance: string | null;
  importance_reasoning: string | null;
}

const stmtSelectAll = kvDb.prepare("SELECT key, value, updated_at, archived_at, last_used_at, use_count, importance, importance_reasoning FROM kv WHERE user_id = ?");
const stmtSetArchived = kvDb.prepare("UPDATE kv SET archived_at = ? WHERE user_id = ? AND key = ? AND importance <> 'critical'");
const stmtTouchUsed = kvDb.prepare("UPDATE kv SET last_used_at = ?, use_count = COALESCE(use_count, 0) + 1 WHERE user_id = ? AND key = ?");

function parseValidUntil(valueJson: string): string | null {
  try {
    const v = JSON.parse(valueJson) as { validUntil?: string | null };
    if (v.validUntil === null || v.validUntil === undefined) return null;
    if (typeof v.validUntil !== "string") return null;
    return v.validUntil;
  } catch {
    return null;
  }
}

export function scanForExpired(userId: string, asOf: string): ScanResult {
  logger.info(
    "调用函数-scanForExpired",
    "调用函数开始：scanForExpired",
    "为什么写这条日志：6-B 变体 + 6 关键区分「过期 ≠ 删除」——扫描库把 validUntil < asOf 的事实写 archived_at（而不是物理删除）。注意：importance = 'critical' 的事实在 WHERE 里被排除（永不过期）。当前：拿到 userId + asOf。",
    { 入参: { userId, asOf }, __code: "const rows = stmtSelectAll.all(userId);" },
  );

  const t0 = Date.now();
  const rows = stmtSelectAll.all(userId) as KvRow[];
  const archivedKeys: string[] = [];

  for (const row of rows) {
    if (row.archived_at) continue; // 已经归档过的不再扫
    if (row.importance === "critical") continue; // critical 永不过期（模型判定 + 代码 WHERE 双保险）
    const validUntil = parseValidUntil(row.value);
    if (validUntil === null) continue; // 永不过期（validUntil = null）
    if (validUntil >= asOf) continue; // 还没过期
    // 过期了 → 写 archived_at
    stmtSetArchived.run(asOf, userId, row.key);
    archivedKeys.push(row.key);
  }

  const result: ScanResult = { scanned: rows.length, archived: archivedKeys.length, archivedKeys };
  logger.info(
    "调用函数-scanForExpired",
    "调用函数结束：scanForExpired",
    `为什么写这条日志：让路由层知道扫了多少条 / 归档了多少条 + 哪些 key。当前：扫描完成，scanned = ${rows.length}，archived = ${archivedKeys.length}。`,
    { 返回值: result, 耗时ms: Date.now() - t0, 字段释义: { "scanned": "扫过的总条数（不含已归档）", "archived": "本次新归档的条数（不含 critical）", "archivedKeys": "本次新归档的 keys" } },
  );

  return result;
}

// ── 6-C：衰减权重 ──
export interface DecayWeight {
  weight: number;
  daysSinceLastUsed: number;
  useCount: number;
}

const DEFAULT_HALF_LIFE_DAYS = 30; // 未评分的事实用默认值（评分前已用 recall 的话）

/** 按模型给的 importance 取半衰减期；未评分的事实用默认值 */
function getHalfLifeDays(importance: string | null): number {
  if (importance && importance in HALF_LIFE_DAYS_BY_IMPORTANCE) {
    return HALF_LIFE_DAYS_BY_IMPORTANCE[importance as ImportanceLevel];
  }
  return DEFAULT_HALF_LIFE_DAYS;
}

export function computeDecayWeight(
  lastUsedAt: string | null,
  useCount: number | null,
  updatedAt: string,
  asOf: string,
  importance: string | null = null,
): DecayWeight {
  const use = useCount ?? 0;
  // 永未用过：把"入库"当成"第一次用"
  const lastUsed = lastUsedAt || updatedAt;
  const daysSince = Math.max(0, (new Date(asOf).getTime() - new Date(lastUsed).getTime()) / (1000 * 60 * 60 * 24));
  const halfLife = getHalfLifeDays(importance);
  // critical 半衰减期 = ∞ → 永远 = 1 + log(use+1)
  if (!isFinite(halfLife)) {
    const weight = 1 + Math.log(use + 1);
    return { weight: Math.round(weight * 1000) / 1000, daysSinceLastUsed: Math.round(daysSince * 10) / 10, useCount: use };
  }
  // 公式：weight = (1 + log(use_count + 1)) / (1 + daysSince / halfLife)
  const weight = (1 + Math.log(use + 1)) / (1 + daysSince / halfLife);
  return { weight: Math.round(weight * 1000) / 1000, daysSinceLastUsed: Math.round(daysSince * 10) / 10, useCount: use };
}

// ── 召回 + 衰减排序 + 命中更新 ──
export interface RecallCandidate {
  key: string;
  value: unknown;
  validUntil: string | null;
  lastUsedAt: string | null;
  useCount: number;
  decayWeight: number;
  daysSinceLastUsed: number;
  /** 模型评分（critical | important | casual | throwaway），NULL = 未评估 */
  importance: string | null;
  /** 模型评分理由（一句话） */
  importanceReasoning: string | null;
}

export interface RecallWithDecayOptions {
  asOf: string;
  topK?: number;        // 默认全部（demo 不截断）
  query?: string;        // 可选关键词过滤（demo 用：client 拼 "framework" 之类的 token）
}

export function recallWithDecay(userId: string, opts: RecallWithDecayOptions): RecallCandidate[] {
  const { asOf, topK, query } = opts;
  logger.info(
    "调用函数-recallWithDecay",
    "调用函数开始：recallWithDecay",
    "为什么写这条日志：6-C 变体 + 6 关键区分——召回按衰减权重排序、命中后更新 last_used_at + use_count += 1（满足需求 6 验收 ③）。当前：拿到 userId + asOf + topK + query。",
    { 入参: { userId, asOf, topK, query }, __code: "const rows = stmtSelectAll.all(userId);" },
  );

  const t0 = Date.now();
  const rows = stmtSelectAll.all(userId) as KvRow[];

  // 过滤：archived_at 非 NULL → 不参与召回
  const live = rows.filter(function (r) { return !r.archived_at; });

  // 关键词过滤（demo 简易版：key 或 value 字符串包含 query 子串就保留）
  const filtered = query
    ? live.filter(function (r) {
        const lower = (r.key + " " + r.value).toLowerCase();
        return lower.indexOf(query.toLowerCase()) >= 0;
      })
    : live;

  // 计算每条的衰减权重 + 按权重降序
  const candidates: RecallCandidate[] = filtered.map(function (r) {
    const dw = computeDecayWeight(r.last_used_at, r.use_count, r.updated_at, asOf, r.importance);
    let parsedValue: unknown = null;
    try { parsedValue = JSON.parse(r.value); } catch { /* noop */ }
    let validUntil: string | null = null;
    if (parsedValue && typeof parsedValue === "object" && "validUntil" in parsedValue) {
      const v = (parsedValue as { validUntil: unknown }).validUntil;
      validUntil = typeof v === "string" ? v : null;
    }
    return {
      key: r.key,
      value: parsedValue,
      validUntil: validUntil,
      lastUsedAt: r.last_used_at,
      useCount: r.use_count ?? 0,
      decayWeight: dw.weight,
      daysSinceLastUsed: dw.daysSinceLastUsed,
      importance: r.importance,
      importanceReasoning: r.importance_reasoning,
    };
  });
  candidates.sort(function (a, b) { return b.decayWeight - a.decayWeight; });
  const sliced = topK ? candidates.slice(0, topK) : candidates;

  // 命中后更新 last_used_at + use_count（演示"被召回即被使用"）
  for (const c of sliced) {
    stmtTouchUsed.run(asOf, userId, c.key);
  }

  logger.info(
    "调用函数-recallWithDecay",
    "调用函数结束：recallWithDecay",
    `为什么写这条日志：让前端拿到衰减权重排序后的候选清单 + 命中事实的 last_used_at / use_count 已更新。当前：召回完成，live = ${live.length}，filtered = ${filtered.length}，return = ${sliced.length}。`,
    { 返回值: sliced, 耗时ms: Date.now() - t0, 字段释义: {
      "decayWeight": "衰减权重（越大越优先）",
      "validUntil": "事实自带有效期；null = 永不过期",
      "lastUsedAt": "最近一次被召回并使用的时间；null = 从未用过",
      "useCount": "被召回次数（log 项 + 1）",
      "daysSinceLastUsed": "距 lastUsedAt 多少天",
    } },
  );

  return sliced;
}

// ── 已归档视图 ──
export interface ArchivedFact {
  key: string;
  value: unknown;
  archivedAt: string;
  updatedAt: string;
  validUntil: string | null;
}

export function listArchived(userId: string): ArchivedFact[] {
  logger.info(
    "调用函数-listArchived",
    "调用函数开始：listArchived",
    "为什么写这条日志：满足需求 6 验收 ①「已归档视图」——事实过期后从召回候选消失，但在「已归档」视图仍能看到原始记录。当前：拿到 userId。",
    { 入参: { userId } },
  );

  const t0 = Date.now();
  const rows = stmtSelectAll.all(userId) as KvRow[];
  const archived = rows
    .filter(function (r) { return !!r.archived_at; })
    .map(function (r) {
      let parsedValue: unknown = null;
      try { parsedValue = JSON.parse(r.value); } catch { /* noop */ }
      let validUntil: string | null = null;
      if (parsedValue && typeof parsedValue === "object" && "validUntil" in parsedValue) {
        const v = (parsedValue as { validUntil: unknown }).validUntil;
        validUntil = typeof v === "string" ? v : null;
      }
      return {
        key: r.key,
        value: parsedValue,
        archivedAt: r.archived_at as string,
        updatedAt: r.updated_at,
        validUntil: validUntil,
      };
    });

  logger.info(
    "调用函数-listArchived",
    "调用函数结束：listArchived",
    `为什么写这条日志：让前端拿到所有已归档事实的清单（key + archivedAt + 原始 value）。当前：列出完成，archived = ${archived.length} 条。`,
    { 返回值: archived, 耗时ms: Date.now() - t0 },
  );

  return archived;
}