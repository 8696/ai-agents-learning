/**
 * 本步核心：第 5 关「冲突与更新」——把笔记 §5 四个动作（NEW / UPDATE / MERGE / DELETE）+ 三种旧值去向（进历史 / 真删 / 软删除）一次性打通。
 *
 * 职责：拿前端传来的 (key, value, intent) + userId，按笔记 §5 表决定动作：
 *   - intent = 'new' 且库里没同 key           → NEW：kvSet 写入（不进历史）
 *   - intent = 'new' 且库里同 key + 同 value  → NOOP：什么都不做
 *   - intent = 'new' 且库里同 key + 不同 value → UPDATE：旧值进 fact_history (action='update')，kvSet 写入
 *   - intent = 'merge' 且库里同 key           → MERGE：旧值进 fact_history (action='merge')，kvSet 写入新 value（业务侧把 values 数组合并好传进来）
 *   - intent = 'delete' 且库里同 key          → DELETE：旧值进 fact_history (action='delete')，kvSoftDelete 把 deleted_at 设为当前时间
 *   - intent = 'delete' 且库里没同 key        → NOOP（空删）
 *
 * 数据流：ResolveConflictArgs
 *   → kvGet 查库 → 按 intent + 库状态决定 action
 *   → NEW / UPDATE / MERGE 调 kvSet
 *   → UPDATE / MERGE 调 kvRecordHistory 写旧值
 *   → DELETE 调 kvSoftDelete + kvRecordHistory 写旧值
 *   → 返回 ResolveConflictResult（含 action / 旧值 / 新值 / 是否进历史）
 *
 * 为什么单独成文件：第 5 关「冲突与更新」笔记独立写过的 4 种动作之一，本步核心。
 * 路由层 routes/conflict.ts 只校验入参、调它、返回；这一层把 4 个动作的逻辑集中。
 *
 * 设计简化：用 intent 字段让前端/用户表达意图（'new' / 'merge' / 'delete'），不调模型判意图——
 * "我改用 React 了"是 update、"我 Vue 和 React 都写"是 merge、"我不用 React 了"是 delete，
 * 这些由用户语言信号表达，业务侧传 intent；不让模型反复判断意图把流程拖长（笔记 §5 决策表）。
 */
import { kvGet, kvSet, kvSoftDelete } from "../db.js";
import { kvRecordHistory } from "../history-store.js";
import { logger } from "../logger.js";

export type ConflictAction = "NEW" | "UPDATE" | "MERGE" | "DELETE" | "NOOP";

export type ConflictIntent = "new" | "update" | "merge" | "delete";

export interface ResolveConflictArgs {
  userId: string;
  key: string;
  value: unknown;            // 业务 schema value（跟 step-1 抽出的候选事实同形状，含 value / type / confidence / source / validUntil）
  intent: ConflictIntent;
  sourceSession: string;     // 演示固定 'demo-session'，未来可换真实 sessionId
  sourceMsgSeq: number;      // 演示固定 0，未来可换真实消息序号
}

export interface ResolveConflictResult {
  action: ConflictAction;
  key: string;
  /** 库里写入前的旧 value（仅 UPDATE / MERGE / DELETE 有；NOOP / NEW = undefined） */
  oldValue: unknown;
  /** 库里写入后的新 value（仅 UPDATE / MERGE 有；NOOP / NEW = 传入的 value；DELETE = undefined） */
  newValue: unknown;
  /** 是否写入了一条历史版本（变体 5 旧值去向 · 进历史） */
  recordedHistory: boolean;
  /** 是否做了软删除（变体 5-C 旧值去向 · 软删除） */
  softDeleted: boolean;
}

/** 抽取业务 schema 包装对象的 value 字段；裸值原样返回 */
function pickBusinessValue(raw: unknown): unknown {
  if (raw !== null && typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    return (raw as { value: unknown }).value;
  }
  return raw;
}

/** 判断两个 value 是否字面完全相同（JSON.stringify 规范化） */
function valuesEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export async function resolveConflict(args: ResolveConflictArgs): Promise<ResolveConflictResult> {
  const { userId, key, value, intent, sourceSession, sourceMsgSeq } = args;
  const incomingBusinessValue = pickBusinessValue(value);

  logger.info(
    "调用函数-resolveConflict",
    "调用函数开始：resolveConflict",
    "为什么写这条日志：第 5 关「冲突与更新」本步核心——按 (intent, 库里状态) 决定 NEW / UPDATE / MERGE / DELETE / NOOP，并把旧值按需塞 fact_history + 软删除。当前：拿到入参，准备按 key 查库。",
    { 入参: { userId, key, intent, value, sourceSession, sourceMsgSeq }, __code: "const existing = await kvGet(userId, key);" },
  );

  const t0 = Date.now();
  const existing = await kvGet(userId, key);
  const existingBusinessValue = existing ? pickBusinessValue(existing.value) : undefined;

  let action: ConflictAction;
  let recordedHistory = false;
  let softDeleted = false;
  let oldValue: unknown = undefined;
  let newValue: unknown = undefined;

  if (!existing) {
    // 库里没这条 key
    if (intent === "delete") {
      // 删库里没有的东西 = NOOP
      action = "NOOP";
    } else {
      // new / update / merge 都按 NEW 处理
      await kvSet(userId, key, value);
      action = "NEW";
      newValue = value;
    }
  } else if (existing.deletedAt) {
    // 库里这条 key 软删了——intent != delete 一律「复活」按 NEW（变体 5-A 同 key 但 deletedAt 非空）
    if (intent === "delete") {
      action = "NOOP";
    } else {
      await kvSet(userId, key, value);
      action = "NEW"; // 复活归 NEW（不是 UPDATE：旧值已被软删，不该当"冲突"看）
      newValue = value;
    }
  } else {
    // 库里存在且未删
    if (intent === "delete") {
      oldValue = existing.value;
      await kvRecordHistory({ userId, factKey: key, action: "delete", oldValue: existing.value, newValue: null, sourceSession, sourceMsgSeq });
      await kvSoftDelete(userId, key);
      action = "DELETE";
      recordedHistory = true;
      softDeleted = true;
    } else if (intent === "merge") {
      oldValue = existing.value;
      await kvRecordHistory({ userId, factKey: key, action: "merge", oldValue: existing.value, newValue: value, sourceSession, sourceMsgSeq });
      await kvSet(userId, key, value);
      action = "MERGE";
      recordedHistory = true;
      newValue = value;
    } else if (intent === "update") {
      if (valuesEqual(existingBusinessValue, incomingBusinessValue)) {
        action = "NOOP";
      } else {
        oldValue = existing.value;
        await kvRecordHistory({ userId, factKey: key, action: "update", oldValue: existing.value, newValue: value, sourceSession, sourceMsgSeq });
        await kvSet(userId, key, value);
        action = "UPDATE";
        recordedHistory = true;
        newValue = value;
      }
    } else {
      // intent === "new" 且库里存在
      if (valuesEqual(existingBusinessValue, incomingBusinessValue)) {
        action = "NOOP";
      } else {
        oldValue = existing.value;
        await kvRecordHistory({ userId, factKey: key, action: "update", oldValue: existing.value, newValue: value, sourceSession, sourceMsgSeq });
        await kvSet(userId, key, value);
        action = "UPDATE";
        recordedHistory = true;
        newValue = value;
      }
    }
  }

  const result: ResolveConflictResult = {
    action,
    key,
    oldValue,
    newValue,
    recordedHistory,
    softDeleted,
  };
  logger.info(
    "调用函数-resolveConflict",
    "调用函数结束：resolveConflict",
    `为什么写这条日志：要让 conflict 路由知道返回什么 + 旧值进了哪里。当前：判定 + 落库完成，action = ${action}，旧值进历史 = ${recordedHistory}，软删除 = ${softDeleted}。`,
    { 返回值: result, 耗时ms: Date.now() - t0, 字段释义: {
      "action": "NEW = 库里没有 → 写入 / UPDATE = 同 key 不同值 → 旧值进历史 + 写入新值 / MERGE = 同 key 合并 → 旧值进历史 + 写入新值（业务侧合并好） / DELETE = 软删除 + 旧值进历史 / NOOP = 字面完全相同 或 删库里没有",
      "recordedHistory": "true = 这次写入了 fact_history 一行（变体 5 旧值去向 · 进历史）",
      "softDeleted": "true = 这次把 deleted_at 设为当前时间（变体 5-C 旧值去向 · 软删除）",
    } },
  );

  return result;
}
