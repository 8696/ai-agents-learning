/**
 * 职责：本步共享的内存状态（ledger / pending / currentNode / lastEvent）+ types + cloneSnapshot + 持久化 hook。
 * 数据流：pause-before-side-effect.ts / transfer-reject.ts / transfer-tools.ts 都从这里读 / 写；
 *   每次 set* 同步触发 SQLite kvSet（fire-and-forget），进程重启由 initState() 加载。
 * 为什么单独成文件：避免状态单例被埋在某个文件里；多个文件要读 / 写同一份内存，必须有唯一来源。
 *
 * 持久化（变体 E · 杀进程再批单还在）：单例 + KV 表（lib/db.ts）。B1 的最小可演示场景：
 *   进程起 → initState() 从磁盘读 pending / ledger → 发起提议 → 写盘 → 杀进程 → 重启 → 同一 runId 仍在 waiting。
 */
import { kvGet, kvSet, kvDel } from "../db.js";

export type TransferArgs = { to: string; amount: number };

export type PendingApproval = {
  runId: string;
  tool: "transfer";
  args: TransferArgs;
  status: "waiting" | "executed" | "rejected" | "failed";
  waitingStartedAt: string; // ISO 8601；B1 暂时不消费（超时是 A4 的事），但写盘带上便于后续
};

export type Ledger = {
  account: string;
  balance: number;
  transferCallCount: number;
  getBalanceCallCount: number;
};

export type CurrentNode = "idle" | "waitForHuman" | "executed" | "executed_failed" | "cancelled";

export type RunSnapshot = {
  ledger: Ledger;
  pending: PendingApproval | null;
  currentNode: CurrentNode;
  lastEvent: string;
};

const INITIAL_BALANCE = 10000;
const USER_ID = "default";
const KEY_LEDGER = "ledger";
const KEY_PENDING = "pending";

// 变体 G · 超时默认拒绝：本 demo 用 30 秒方便演示；生产场景通常是几分钟到几小时。
// 「没人反对不是同意」——超时 = 走取消边，与「人拒绝」同条安全边。
export const PENDING_TIMEOUT_MS = 30_000;

// 单例：进程内一份；同一 demo 进程里所有调用共享。
let ledger: Ledger = {
  account: "公司账户",
  balance: INITIAL_BALANCE,
  transferCallCount: 0,
  getBalanceCallCount: 0,
};
let pending: PendingApproval | null = null;
let currentNode: CurrentNode = "idle";
let lastEvent = "还没发起过提议。账本是初始余额。";

// 启动时调用一次：从磁盘恢复 pending / ledger；恢复后 currentNode 设为 waitForHuman（如果 pending 存在）。
// 失败也走默认初始状态；不让启动失败阻塞 listen。
export async function initState(): Promise<void> {
  try {
    const persistedLedger = (await kvGet(USER_ID, KEY_LEDGER)) as Ledger | undefined;
    if (persistedLedger && typeof persistedLedger.balance === "number") {
      ledger = persistedLedger;
    }
    const persistedPending = (await kvGet(USER_ID, KEY_PENDING)) as PendingApproval | null | undefined;
    if (persistedPending && persistedPending.status === "waiting") {
      pending = persistedPending;
      currentNode = "waitForHuman";
      lastEvent =
        "从磁盘恢复：待审批仍在（runId=" +
        persistedPending.runId +
        "，向 " +
        persistedPending.args.to +
        " 转 " +
        persistedPending.args.amount +
        " 元）。余额仍是 " +
        ledger.balance +
        "。";
    }
  } catch {
    // 启动失败不阻塞；保留初始状态。
  }
}

// 持久化 helper（fire-and-forget；写失败静默；业务路径不 await）。
function persist(key: string, value: unknown): void {
  void kvSet(USER_ID, key, value).catch(() => {
    // ignore — 业务路径不依赖磁盘；下次 set* 会重写
  });
}
function clearPersisted(key: string): void {
  void kvDel(USER_ID, key).catch(() => {
    // ignore
  });
}

export function getLedger(): Ledger {
  return ledger;
}
export function setLedger(next: Ledger): void {
  ledger = next;
  persist(KEY_LEDGER, ledger);
}

export function getPending(): PendingApproval | null {
  return pending;
}
export function setPending(next: PendingApproval | null): void {
  pending = next;
  if (next === null) {
    clearPersisted(KEY_PENDING);
  } else {
    persist(KEY_PENDING, pending);
  }
}

export function getCurrentNode(): CurrentNode {
  return currentNode;
}
export function setCurrentNode(next: CurrentNode): void {
  currentNode = next;
}

export function getLastEvent(): string {
  return lastEvent;
}
export function setLastEvent(next: string): void {
  lastEvent = next;
}

export function cloneSnapshot(): RunSnapshot {
  return {
    ledger: { ...ledger },
    pending: pending ? { ...pending, args: { ...pending.args } } : null,
    currentNode,
    lastEvent,
  };
}

export function resetState(): void {
  ledger = { account: "公司账户", balance: INITIAL_BALANCE, transferCallCount: 0, getBalanceCallCount: 0 };
  pending = null;
  currentNode = "idle";
  lastEvent = "已重置。余额回到 10000，待审批清空。";
  persist(KEY_LEDGER, ledger);
  clearPersisted(KEY_PENDING);
}

export function incrementBalanceReadCount(): number {
  ledger = { ...ledger, getBalanceCallCount: ledger.getBalanceCallCount + 1 };
  persist(KEY_LEDGER, ledger);
  return ledger.getBalanceCallCount;
}

/**
 * 变体 G · 超时判定：pending 存在 + status=waiting + 距离 waitingStartedAt 已超过 PENDING_TIMEOUT_MS。
 * 后端在任何"读 pending / 走 pending 边"前都先查一次；前端用来渲染倒计时（剩余多少秒）。
 */
export function isPendingExpired(p: PendingApproval | null, nowMs: number = Date.now()): boolean {
  if (!p || p.status !== "waiting") return false;
  const startedMs = new Date(p.waitingStartedAt).getTime();
  if (!Number.isFinite(startedMs)) return false;
  return nowMs - startedMs > PENDING_TIMEOUT_MS;
}

/**
 * 给前端用的剩余秒数（向下取整；负数归零）。
 * pending 不存在或 status != waiting → 返回 0（前端不显示倒计时）。
 */
export function getSecondsLeft(p: PendingApproval | null, nowMs: number = Date.now()): number {
  if (!p || p.status !== "waiting") return 0;
  const startedMs = new Date(p.waitingStartedAt).getTime();
  if (!Number.isFinite(startedMs)) return 0;
  const leftMs = PENDING_TIMEOUT_MS - (nowMs - startedMs);
  return Math.max(0, Math.floor(leftMs / 1000));
}
