/**
 * 职责：editTransferPending —— 改 pending.args（收款人 / 金额），不改 status、不调 executeTransfer。
 * 数据流：路由 → editTransferPending(runId, newArgs) → 校验 → setPending({...pending, args: newArgs})。
 * 为什么单独成文件：跟 transfer-reject.ts 对称；改参数是独立的「修正」动作，与提议 / 通过 / 拒绝并列。
 *
 * 关键不变量：edit 绝不调 executeTransfer，pending.status 保持 "waiting"。
 */
import { logger } from "../logger.js";
import {
  cloneSnapshot,
  getPending,
  setLastEvent,
  setPending,
  type PendingApproval,
  type RunSnapshot,
  type TransferArgs,
} from "./transfer-state.js";

export function editTransferPending(runId: string, newArgs: TransferArgs): RunSnapshot {
  const t0 = Date.now();
  logger.info(
    "调用函数-editTransferPending",
    "调用函数开始：editTransferPending",
    "为什么写这条日志：改参数这一步绝对不能调 executeTransfer，status 必须仍是 waiting。当前：刚收到人的修改。",
    { 入参: { runId, newArgs, 当前快照: cloneSnapshot() }, __code: "if (pending.status===\"waiting\" && runId 对得上) pending = { ...pending, args: newArgs }; // status 不变" },
  );

  const pendingNow = getPending();
  if (!pendingNow || pendingNow.status !== "waiting") {
    const err = new Error("没有待审批的转账，无法改参数。");
    logger.error(
      "调用函数-editTransferPending",
      "调用函数结束：editTransferPending（失败）",
      "为什么写这条日志：空点编辑不能当已经改完。当前：pending 未改。",
      { 返回值: { name: err.name, message: err.message, pending: pendingNow }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  if (pendingNow.runId !== runId) {
    const err = new Error("任务运行编号对不上，拒绝把别人的单当成这一笔。");
    logger.error(
      "调用函数-editTransferPending",
      "调用函数结束：editTransferPending（失败）",
      "为什么写这条日志：编号错了不能改别人的单。当前：pending 仍是 waiting。",
      { 返回值: { name: err.name, message: err.message, expected: pendingNow.runId, got: runId }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }

  // 改参数 ≠ 批准。只动 pending.args；status 保持 waiting；executeTransfer 一次都不进。
  const next: PendingApproval = {
    ...pendingNow,
    args: { to: newArgs.to, amount: newArgs.amount },
  };
  setPending(next);
  setLastEvent(
    "人已修改参数，pending.status 仍是 waiting。改后将向 " +
      newArgs.to +
      " 转 " +
      newArgs.amount +
      " 元（仍需点通过才扣款）。",
  );
  const result = cloneSnapshot();
  logger.info(
    "调用函数-editTransferPending",
    "调用函数结束：editTransferPending",
    "为什么写这条日志：要把改后的 args 原文交给页面，让 pending 卡片刷新。当前：args 已改、status 未变、executeTransfer 未进。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: {
        "pending.status": "仍是 waiting（改参数 ≠ 批准）",
        "pending.args": "已改为人改过的值",
        "ledger.transferCallCount": "必须仍是 0（改参数不应触发执行）",
      },
    },
  );
  return result;
}
