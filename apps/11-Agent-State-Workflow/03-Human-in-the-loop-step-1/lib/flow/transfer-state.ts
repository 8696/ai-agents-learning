/**
 * 职责：本步共享的内存状态（ledger / pending / currentNode / lastEvent）+ types + cloneSnapshot。
 * 数据流：pause-before-side-effect.ts / transfer-reject.ts / transfer-tools.ts 都从这里读 / 写。
 * 为什么单独成文件：避免状态单例被埋在某个文件里；多个文件要读 / 写同一份内存，必须有唯一来源。
 */
export type TransferArgs = { to: string; amount: number };

export type PendingApproval = {
  runId: string;
  tool: "transfer";
  args: TransferArgs;
  status: "waiting" | "executed" | "rejected";
};

export type Ledger = {
  account: string;
  balance: number;
  transferCallCount: number;
  getBalanceCallCount: number;
};

export type CurrentNode = "idle" | "waitForHuman" | "executed" | "cancelled";

export type RunSnapshot = {
  ledger: Ledger;
  pending: PendingApproval | null;
  currentNode: CurrentNode;
  lastEvent: string;
};

const INITIAL_BALANCE = 10000;

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

export function getLedger(): Ledger {
  return ledger;
}
export function setLedger(next: Ledger): void {
  ledger = next;
}

export function getPending(): PendingApproval | null {
  return pending;
}
export function setPending(next: PendingApproval | null): void {
  pending = next;
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
}

export function incrementBalanceReadCount(): number {
  ledger = { ...ledger, getBalanceCallCount: ledger.getBalanceCallCount + 1 };
  return ledger.getBalanceCallCount;
}
