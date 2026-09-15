/**
 * 职责：写入时机的内存状态层——后台 run Map + session-end 待结算队列 Map。
 * 数据流：trigger-write.ts 调用本文件存 / 取；routes/status.ts 调本文件读。
 *
 * 为什么单独成文件：本步教学点是「写入时机」，状态存取（Map 操作 / 列表查询）是「旁边小帮手」，
 * 与 triggerWrite 主流程分开控制行数；trigger-write.ts 控制 ≤280 行（§5.3.8 文件行数硬上限）。
 *
 * 不持久化（演示用；重启清空）；生产可换 Redis / SQLite。
 */
import { randomUUID } from "node:crypto";
import type { Candidate } from "./extract-facts.js";

// ── 后台 run 状态 ──
export interface BackgroundRun {
  runId: string;
  status: "pending" | "done" | "failed";
  startedAt: number;
  finishedAt?: number;
  factsCountBefore: number;
  factsCountAfter?: number;
  candidatesCount?: number;
  writtenKeys?: string[];
  /** background 模式 run 完成时也带回抽取的候选清单，让页面看清「抽了什么出来」 */
  candidates?: Candidate[];
  error?: string;
}

// ── 会话结束待结算队列 ──
export interface PendingFlush {
  conversationId: string;
  items: Array<{ text: string; queuedAt: number }>;
}

export const DEFAULT_USER_ID = "default";
export const BACKGROUND_DELAY_MS = 2000; // 固定 2 秒，让「紧接 recall 召回不到」肉眼可观察

const backgroundRuns = new Map<string, BackgroundRun>();
const pendingConversations = new Map<string, PendingFlush>();

export function newRunId(): string {
  return randomUUID();
}

export function setBackgroundRun(run: BackgroundRun): void {
  backgroundRuns.set(run.runId, run);
}

export function getBackgroundRun(runId: string): BackgroundRun | undefined {
  return backgroundRuns.get(runId);
}

export function listBackgroundRuns(): BackgroundRun[] {
  return Array.from(backgroundRuns.values()).sort((a, b) => b.startedAt - a.startedAt);
}

export function getOrCreatePending(conversationId: string): PendingFlush {
  let pending = pendingConversations.get(conversationId);
  if (!pending) {
    pending = { conversationId, items: [] };
    pendingConversations.set(conversationId, pending);
  }
  return pending;
}

export function listPendingConversations(): Array<{ conversationId: string; pendingCount: number }> {
  return Array.from(pendingConversations.values()).map((p) => ({
    conversationId: p.conversationId,
    pendingCount: p.items.length,
  }));
}

export function takePending(conversationId: string): PendingFlush | undefined {
  const pending = pendingConversations.get(conversationId);
  if (pending) pendingConversations.delete(conversationId);
  return pending;
}
