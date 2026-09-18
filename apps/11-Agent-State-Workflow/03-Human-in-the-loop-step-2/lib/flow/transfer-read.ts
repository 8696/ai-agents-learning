/**
 * 职责：readBalance —— 只读流程事件。增加 getBalanceCallCount，不写 pending，不进等待节点。
 * 数据流：路由 → readBalance → incrementBalanceReadCount → cloneSnapshot。
 * 为什么单独成文件：跟 transfer-reject.ts 对称；只读是独立的「边」（与提议 / 通过 / 拒绝并列）。
 */
import { logger } from "../logger.js";
import {
  cloneSnapshot,
  getLastEvent,
  incrementBalanceReadCount,
  setLastEvent,
  type RunSnapshot,
} from "./transfer-state.js";

export function readBalance(): RunSnapshot {
  const t0 = Date.now();
  logger.info(
    "调用函数-readBalance",
    "调用函数开始：readBalance",
    "为什么写这条日志：只读工具不应写 pending，不应改 currentNode，不应调 executeTransfer。当前：刚收到查余额请求。",
    { 入参: {}, __code: "incrementBalanceReadCount(); // 只 + 计数，不写 pending，不走等待节点" },
  );

  const newCount = incrementBalanceReadCount();
  setLastEvent(
    "查余额完成（只读工具，不进等待节点）。getBalanceCallCount=" +
      newCount +
      "，pending 未变，余额仍是 " +
      cloneSnapshot().ledger.balance +
      "。",
  );
  void getLastEvent; // 兼容「未使用」检查：实际通过 setLastEvent 写入

  const result = cloneSnapshot();
  logger.info(
    "调用函数-readBalance",
    "调用函数结束：readBalance",
    "为什么写这条日志：调用次数 +1 才能证明「自动跑了」。当前：pending 还是上次的状态（如果有）；executeTransfer 未进。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      字段释义: {
        "ledger.getBalanceCallCount": "每次查 +1；用来证明只读工具自动走了几次",
        "ledger.transferCallCount": "仍是 0；只读工具不应触发执行函数",
        "ledger.balance": "只读不改余额，仍是上次值",
      },
    },
  );
  return result;
}
