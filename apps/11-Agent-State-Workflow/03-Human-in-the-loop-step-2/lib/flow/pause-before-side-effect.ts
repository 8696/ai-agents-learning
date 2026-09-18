/**
 * 本步核心：转账工具执行前停住，等人点通过才真正扣款。
 *
 * 职责：手写等待人的节点（wait-for-human）。提议只写入待审批（pending approval），不调用扣款。
 * 数据流：proposeTransfer → mustPause("transfer") 为真 → 写入 pending、余额不动 → approveTransfer → 这时才 executeTransfer；
 *   rejectTransfer（./transfer-reject.ts）→ 改 pending.status="rejected"，currentNode="cancelled"，账本不动、executeTransfer 仍不进。
 * 为什么单独成文件：学习者应先打开这一份把主路径看完；路由只校验入参再调用这里。
 *
 * Step 1 不做：改参数、杀进程再批、超时。本进程内存表，重启会丢单（那是下一步）。
 * 本步已做：通过、拒绝（变体 C 的前两半；改完再通过未做）。
 *
 * 拆文件说明：
 *   types / 单例 → ./transfer-state.ts
 *   mustPause / executeTransfer → ./transfer-tools.ts
 *   rejectTransfer → ./transfer-reject.ts
 *   本文件留：getSnapshot / resetDemo / proposeTransfer / approveTransfer + re-export 让路由文件不感知拆分。
 */
import { logger } from "../logger.js";
import {
  cloneSnapshot,
  getLedger,
  getPending,
  resetState,
  setCurrentNode,
  setLastEvent,
  setLedger,
  setPending,
  type PendingApproval,
  type RunSnapshot,
  type TransferArgs,
} from "./transfer-state.js";
import { executeTransfer, mustPause } from "./transfer-tools.js";

// 让路由文件继续 `import { proposeTransfer, approveTransfer, rejectTransfer, readBalance, editTransferPending, isReadOnly, getPending, isPendingExpired, getSecondsLeft } from "./pause-before-side-effect.js"`；
// 这些函数在本文件 / ./transfer-reject.ts / ./transfer-read.ts / ./transfer-edit.ts / ./transfer-state.ts 各一份。
export { rejectTransfer } from "./transfer-reject.js";
export { readBalance } from "./transfer-read.js";
export { editTransferPending } from "./transfer-edit.js";
export { isReadOnly } from "./transfer-tools.js";
export { getPending, isPendingExpired, getSecondsLeft } from "./transfer-state.js";
export type { TransferArgs, PendingApproval, Ledger, CurrentNode, RunSnapshot } from "./transfer-state.js";

import type { Ledger } from "./transfer-state.js";

export function getSnapshot(): RunSnapshot {
  const t0 = Date.now();
  logger.info(
    "调用函数-getSnapshot",
    "调用函数开始：getSnapshot",
    "为什么写这条日志：页面要看见点头前余额和待审批原文。当前：只读内存表。",
    { 入参: {}, __code: "return cloneSnapshot();" },
  );
  const result = cloneSnapshot();
  logger.info(
    "调用函数-getSnapshot",
    "调用函数结束：getSnapshot",
    "为什么写这条日志：把账本和 pending 原文交给页面。当前：读完了。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}

export function resetDemo(): RunSnapshot {
  const t0 = Date.now();
  logger.info(
    "调用函数-resetDemo",
    "调用函数开始：resetDemo",
    "为什么写这条日志：同一页要能再走一遍「先停再通过」。当前：清内存表。",
    { 入参: {}, __code: "resetState();" },
  );
  resetState();
  const result = cloneSnapshot();
  logger.info(
    "调用函数-resetDemo",
    "调用函数结束：resetDemo",
    "为什么写这条日志：重置后应能再发起一笔。当前：表已清空。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}

export function proposeTransfer(args: TransferArgs): RunSnapshot {
  const t0 = Date.now();
  logger.info(
    "调用函数-proposeTransfer",
    "调用函数开始：proposeTransfer",
    "为什么写这条日志：这是本步主路径的第一下——只提议、不扣款。当前：刚收到收款人和金额。",
    { 入参: { args, 当前快照: cloneSnapshot() }, __code: "if (mustPause(\"transfer\")) { pending = waiting; 不调用 executeTransfer; }" },
  );

  const pendingNow = getPending();
  if (pendingNow && pendingNow.status === "waiting") {
    const err = new Error("已有一笔待审批，先点通过或重置后再发起。");
    logger.error(
      "调用函数-proposeTransfer",
      "调用函数结束：proposeTransfer（失败）",
      "为什么写这条日志：不允许叠两张未批的单。当前：仍停在上一笔。",
      { 返回值: { name: err.name, message: err.message, pending: pendingNow }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }

  // ① 写死策略：transfer 必须停。顺序不能换成「先扣再问」。
  const shouldPause = mustPause("transfer");
  if (!shouldPause) {
    const err = new Error("本步预期 transfer 必须停，策略却返回不必停。");
    logger.error(
      "调用函数-proposeTransfer",
      "调用函数结束：proposeTransfer（失败）",
      "为什么写这条日志：名单写错会让教学点消失。当前：没有写入 pending。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }

  // ② 走进等待节点：只摊开将要发生的操作，不进 executeTransfer。
  const runId = "run-" + Date.now();
  const nextPending: PendingApproval = {
    runId,
    tool: "transfer",
    args: { to: args.to, amount: args.amount },
    status: "waiting",
    waitingStartedAt: new Date().toISOString(),
  };
  const ledgerNow = getLedger();
  setPending(nextPending);
  setCurrentNode("waitForHuman");
  setLastEvent(
    "已写入待审批，尚未调用 executeTransfer。余额仍是 " +
      ledgerNow.balance +
      "，调用次数仍是 " +
      ledgerNow.transferCallCount +
      "。",
  );
  const result = cloneSnapshot();
  logger.info(
    "调用函数-proposeTransfer",
    "调用函数结束：proposeTransfer",
    "为什么写这条日志：要用「次数仍为 0 + 余额未变」证明停在执行前。当前：pending.status=waiting。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: {
        "pending.status": "waiting = 人还没点头，不许扣款",
        currentNode: "waitForHuman = 调度器停在等待节点",
        "ledger.transferCallCount": "仍为 0 才说明 executeTransfer 没进",
      },
    },
  );
  return result;
}

export function approveTransfer(runId: string, forceFail: boolean = false): RunSnapshot {
  const t0 = Date.now();
  logger.info(
    "调用函数-approveTransfer",
    "调用函数开始：approveTransfer",
    "为什么写这条日志：这是本步主路径的第二下——人点头之后才允许副作用；forceFail 模拟支付渠道挂。当前：刚收到人的通过。",
    { 入参: { runId, forceFail, 当前快照: cloneSnapshot() }, __code: "try { ledger = executeTransfer(ledger, pending.args, forceFail) } catch { pending.status='failed'; currentNode='executed_failed'; }" },
  );

  const pendingNow = getPending();
  if (!pendingNow || pendingNow.status !== "waiting") {
    const err = new Error("没有待审批的转账，无法通过。");
    logger.error(
      "调用函数-approveTransfer",
      "调用函数结束：approveTransfer（失败）",
      "为什么写这条日志：空点通过不能当已经同意。当前：没有执行。",
      { 返回值: { name: err.name, message: err.message, pending: pendingNow }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  if (pendingNow.runId !== runId) {
    const err = new Error("任务运行编号对不上，拒绝把别人的单当成这一笔。");
    logger.error(
      "调用函数-approveTransfer",
      "调用函数结束：approveTransfer（失败）",
      "为什么写这条日志：编号错了不能扣款。当前：pending 仍是 waiting。",
      { 返回值: { name: err.name, message: err.message, expected: pendingNow.runId, got: runId }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }

  // ③ 这时才调用有副作用的工具。顺序不能提前到提议阶段。
  const ledgerBefore = getLedger();
  let snapshotStatus: "executed" | "failed" = "executed";
  let failureMessage = "";
  try {
    const ledgerNext: Ledger = executeTransfer(ledgerBefore, pendingNow.args, forceFail);
    setLedger(ledgerNext);
  } catch (err: unknown) {
    // 变体 F：执行失败 ≠ 人拒绝。账本未改；pending.status=failed、currentNode=executed_failed。
    // 关键不变量：transferCallCount 仍是 0（executeTransfer throw 前已写过"次数没加"日志）。
    snapshotStatus = "failed";
    failureMessage = err instanceof Error ? err.message : String(err);
  }
  setPending({ ...pendingNow, status: snapshotStatus });
  if (snapshotStatus === "executed") {
    setCurrentNode("executed");
    const ledgerNow = getLedger();
    setLastEvent(
      "人已通过，已调用 executeTransfer 一次。余额变成 " +
        ledgerNow.balance +
        "，调用次数变成 " +
        ledgerNow.transferCallCount +
        "。",
    );
  } else {
    setCurrentNode("executed_failed");
    setLastEvent(
      "人已通过，但执行失败：「" +
        failureMessage +
        "」。账本未改（余额仍是 " +
        ledgerBefore.balance +
        "，调用次数仍是 " +
        ledgerBefore.transferCallCount +
        "）。",
    );
  }
  const result = cloneSnapshot();
  logger.info(
    "调用函数-approveTransfer",
    "调用函数结束：approveTransfer",
    "为什么写这条日志：对比提议前后的次数，才能看见「点头后才发生」；区分 executed / failed 两种结果。当前：pending.status=" +
      snapshotStatus +
      "。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: {
        "pending.status": snapshotStatus === "executed"
          ? "executed = 人已同意且扣款函数已成功跑过"
          : "failed = 人已同意但执行失败（账本未改、调用次数仍是 0）",
        "ledger.transferCallCount": snapshotStatus === "executed"
          ? "应为 1；若提议阶段就已经 1，说明先做后弹窗"
          : "必须仍是 0；若 > 0，说明 executeTransfer throw 前已修改账本（实现 bug）",
        currentNode: snapshotStatus === "executed"
          ? "executed = 走执行边成功"
          : "executed_failed = 走执行边但失败；不是 cancel（cancel 是人拒绝）",
      },
    },
  );
  return result;
}
