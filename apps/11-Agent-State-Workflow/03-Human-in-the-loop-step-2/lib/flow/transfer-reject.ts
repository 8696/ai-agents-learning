/**
 * 职责：rejectTransfer —— 拒绝这一步单独成文件。是流程主路径里新加的「走取消边」事件。
 * 数据流：路由 → rejectTransfer → 改 pending.status="rejected" / currentNode="cancelled"，不动 ledger。
 * 为什么单独成文件：让 pause-before-side-effect.ts ≤ 280 行；拒绝是独立的边（与提议 / 通过并列），拆开不破坏对称学习价值。
 */
import { logger } from "../logger.js";
import {
  cloneSnapshot,
  getCurrentNode,
  getLedger,
  getPending,
  setCurrentNode,
  setLastEvent,
  setPending,
  type RunSnapshot,
} from "./transfer-state.js";

export function rejectTransfer(runId: string): RunSnapshot {
  const t0 = Date.now();
  logger.info(
    "调用函数-rejectTransfer",
    "调用函数开始：rejectTransfer",
    "为什么写这条日志：拒绝这一步必须保证 executeTransfer 没被调用。当前：刚收到人的驳回。",
    { 入参: { runId, 当前快照: cloneSnapshot() }, __code: "if (pending.status===\"waiting\" && runId 对得上) { pending.status=\"rejected\"; 不调用 executeTransfer; }" },
  );

  const pendingNow = getPending();
  if (!pendingNow || pendingNow.status !== "waiting") {
    const err = new Error("没有待审批的转账，无法拒绝。");
    logger.error(
      "调用函数-rejectTransfer",
      "调用函数结束：rejectTransfer（失败）",
      "为什么写这条日志：空点拒绝不能当已经驳回。当前：账本未改。",
      { 返回值: { name: err.name, message: err.message, pending: pendingNow }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  if (pendingNow.runId !== runId) {
    const err = new Error("任务运行编号对不上，拒绝把别人的单当成这一笔。");
    logger.error(
      "调用函数-rejectTransfer",
      "调用函数结束：rejectTransfer（失败）",
      "为什么写这条日志：编号错了不能标 rejected。当前：pending 仍是 waiting。",
      { 返回值: { name: err.name, message: err.message, expected: pendingNow.runId, got: runId }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }

  // 拒绝路径：只改 pending.status 与 currentNode；executeTransfer 一次都不进。
  // 顺序不能换成「先扣再标 rejected」——那就是先做后弹窗。
  const ledgerBefore = getLedger();
  const balanceBefore = ledgerBefore.balance;
  const callCountBefore = ledgerBefore.transferCallCount;
  setPending({ ...pendingNow, status: "rejected" });
  setCurrentNode("cancelled");
  setLastEvent(
    "人已拒绝，未调用 executeTransfer。余额仍是 " +
      balanceBefore +
      "，调用次数仍是 " +
      callCountBefore +
      "。",
  );
  const result = cloneSnapshot();
  logger.info(
    "调用函数-rejectTransfer",
    "调用函数结束：rejectTransfer",
    "为什么写这条日志：拒绝后余额必须仍是拒绝前的数，调用次数必须仍是 0（如果变了说明 executeTransfer 进过）。当前：pending.status=rejected、currentNode=cancelled。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: {
        "pending.status": "rejected = 人驳回，账本不动",
        currentNode: "cancelled = 走取消边，不走执行边",
        "ledger.transferCallCount": "必须仍是 0；若 > 0，说明执行函数在拒绝前已跑过",
        "ledger.balance": "必须等于拒绝前的余额",
      },
    },
  );
  // 避免「未使用」警告：getCurrentNode 只为日志 / 测试保留
  void getCurrentNode;
  return result;
}
