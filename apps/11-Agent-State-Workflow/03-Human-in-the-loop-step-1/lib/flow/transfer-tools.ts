/**
 * 职责：mustPause + executeTransfer 是「转账工具」的两个动作（写死名单 + 真副作用），与流程（提议 / 通过 / 拒绝）分开。
 * 数据流：流程文件 → mustPause / executeTransfer(currentLedger, args) → 返回新 ledger 给流程文件赋值。
 * 为什么单独成文件：让 pause-before-side-effect.ts ≤ 280 行；mustPause（写死名单）和 executeTransfer（真副作用）是工具实现细节，不是流程事件。
 */
import { logger } from "../logger.js";
import type { Ledger, TransferArgs } from "./pause-before-side-effect.js";

const MUST_PAUSE_TOOLS = new Set(["transfer", "delete_row"]);
const READ_ONLY_TOOLS = new Set(["getBalance"]);

export function mustPause(tool: string): boolean {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-mustPause",
    "调用函数开始：mustPause",
    "为什么写这条日志：停不停由写死名单决定，不读模型口头保证。当前：在判断这个工具要不要进等待节点。",
    {
      入参: { tool, 写死名单: Array.from(MUST_PAUSE_TOOLS) },
      __code: "return MUST_PAUSE_TOOLS.has(tool);",
    },
  );
  const result = MUST_PAUSE_TOOLS.has(tool);
  logger.info(
    "│ 调用函数-mustPause",
    "调用函数结束：mustPause",
    "为什么写这条日志：true 就必须停在执行前。当前：名单已判完。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}

/**
 * 真改世界的那一下；按值收 ledger、按值返回新 ledger，不持有单例状态。
 * 流程文件收到返回值后赋值给本流程的单例 ledger（pause-before-side-effect.ts）。
 */
export function executeTransfer(currentLedger: Ledger, args: TransferArgs): Ledger {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-executeTransfer",
    "调用函数开始：executeTransfer",
    "为什么写这条日志：这是真正改世界的那一下。当前：人已经点通过，才允许进这个函数。",
    {
      入参: { args, 调用前余额: currentLedger.balance, 调用前次数: currentLedger.transferCallCount },
      __code: "return { ...currentLedger, balance: currentLedger.balance - args.amount, transferCallCount: currentLedger.transferCallCount + 1 };",
    },
  );
  if (args.amount > currentLedger.balance) {
    const err = new Error("余额不足，无法转出 " + args.amount);
    logger.error(
      "│ 调用函数-executeTransfer",
      "调用函数结束：executeTransfer（失败）",
      "为什么写这条日志：人通过了但账上不够。当前：余额没动、次数没加。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  const next: Ledger = {
    ...currentLedger,
    balance: currentLedger.balance - args.amount,
    transferCallCount: currentLedger.transferCallCount + 1,
  };
  logger.info(
    "│ 调用函数-executeTransfer",
    "调用函数结束：executeTransfer",
    "为什么写这条日志：次数加一才能证明「点头前没发生」。当前：钱已按待审批金额扣走。",
    { 返回值: next, 耗时ms: Date.now() - t0 },
  );
  return next;
}

/**
 * 是不是只读工具。只读工具没有副作用，调度器直接放行，不进等待节点。
 * 与 mustPause 互斥：一个工具要么在危险黑名单里、要么在只读白名单里、要么未声明。
 * 当前白名单只放 getBalance；查订单 / 查库存等只读工具未来加在这里。
 */
export function isReadOnly(tool: string): boolean {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-isReadOnly",
    "调用函数开始：isReadOnly",
    "为什么写这条日志：必须区分「只读白名单」和「危险黑名单」。当前：在判这个工具是不是只读。",
    {
      入参: { tool, 只读白名单: Array.from(READ_ONLY_TOOLS) },
      __code: "return READ_ONLY_TOOLS.has(tool);",
    },
  );
  const result = READ_ONLY_TOOLS.has(tool);
  logger.info(
    "│ 调用函数-isReadOnly",
    "调用函数结束：isReadOnly",
    "为什么写这条日志：true 就直接执行，不进等待节点。当前：白名单已判完。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}
