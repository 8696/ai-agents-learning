/**
 * 职责：调度器走一步并**只更新内存**，故意不调 writeCheckpoint。
 * 教学目的：模拟 LangGraph `MemorySaver`——同进程 Map，杀进程即丢，没有磁盘检查点。
 * 数据流：内存里取当前状态 → 跑当前节点 → 路由挑下一站 → 验边 → 写 currentNode → 写回内存。
 *   **不调** writeCheckpoint、**不调** readCheckpoint。
 * 为什么单独成文件：和 stepOnceAndWrite（写盘）的对照是变体 B 的核心；埋在路由里就讲不清「为什么必须写到进程外面」。
 */
import { logger } from "../logger.js";
import {
  type CafeState,
  type NodeName,
  NODES,
  isLegalEdge,
  isTerminal,
  routeAfter,
} from "./cafe-graph.js";
import { getRun, putRun } from "./step-with-checkpoint.js";
import { snapshotPayment, type PaymentSnapshot } from "./payment-ledger.js";

export interface InMemoryStepResult {
  runId: string;
  before: CafeState;
  state: CafeState;
  stopped: boolean;
  payment: PaymentSnapshot;
}

function logCall<T>(
  scope: string,
  name: string,
  explainWhy: string,
  args: unknown,
  code: string,
  fieldGuide: Record<string, string>,
  run: () => T,
): T {
  const started = Date.now();
  logger.info(scope, `调用函数开始：${name}`, `为什么写这条日志：${explainWhy}。当前：刚进入 ${name}。`, {});
  logger.info(scope, `调用函数：${name}`, `为什么写这条日志：记下完整入参。当前：尚未执行函数体。`, { 入参: args });
  logger.info(scope, `调用函数：${name}`, `为什么写这条日志：对照函数体。当前：即将执行。`, { __code: code });
  try {
    const result = run();
    logger.info(scope, `调用函数结束：${name}`, `为什么写这条日志：这一调用结束。当前：即将返回调用方。`, {
      返回值: result,
      耗时ms: Date.now() - started,
      字段释义: fieldGuide,
    });
    return result;
  } catch (error: unknown) {
    logger.error(scope, `调用函数结束：${name}（失败）`, `为什么写这条日志：调用失败也要留下结束。当前：${name} 抛错。`, {
      返回值: error,
      耗时ms: Date.now() - started,
    });
    throw error;
  }
}

export function stepOnceInMemoryOnly(runId: string): InMemoryStepResult {
  return logCall(
    "只更新内存（不写磁盘）",
    "stepOnceInMemoryOnly",
    "本步核心：模拟 LangGraph MemorySaver——同进程 Map 写一步，磁盘上**不**留检查点，杀进程即丢",
    { runId },
    stepOnceInMemoryOnly.toString(),
    {
      before: "走这一步之前的状态（只在内存里）",
      state: "走完后的新状态（含新的 currentNode）",
      stopped: "是否已到终止站 okEnd",
      payment: "支付渠道账本（如果走到扣卡站）",
    },
    () => {
      const before = getRun(runId);
      if (!before) {
        throw Object.assign(
          new Error("内存里找不到这件任务运行。In-memory 步进没有磁盘回退，进程没了就真没了。"),
          { code: "RUN_NOT_FOUND" },
        );
      }
      if (isTerminal(before.currentNode)) {
        throw Object.assign(new Error(`已经停在终止站 ${before.currentNode}，这一步不再往下走`), {
          code: "ALREADY_STOPPED",
        });
      }

      const from = before.currentNode;
      const nodeFn = NODES[from];
      const patch = logCall(
        "│ 当前节点",
        nodeFn.name || from,
        "调度器先跑当前节点，节点只返回要改的字段",
        { from, state: before },
        nodeFn.toString(),
        {
          drinkType: "热饮或冰饮",
          executedToolCallIds: "已经对外发生过的工具调用编号",
        },
        () => {
          const raw: Partial<CafeState> = { ...nodeFn(before, runId) };
          delete (raw as { currentNode?: NodeName }).currentNode;
          return raw;
        },
      );
      const afterNode: CafeState = { ...before, ...patch };
      const next = logCall(
        "│ 路由",
        "routeAfter",
        "节点跑完后由路由挑下一站",
        { from, drinkType: afterNode.drinkType },
        routeAfter.toString(),
        { next: "写进内存检查点的当前节点名" },
        () => routeAfter(from, afterNode),
      );
      if (!isLegalEdge(from, next)) {
        throw Object.assign(new Error(`非法转移：${from} 不能去 ${next}`), { code: "ILLEGAL_EDGE" });
      }
      const state: CafeState = {
        ...afterNode,
        currentNode: next,
        completedNodes: [...before.completedNodes, from],
      };
      putRun(runId, state);

      return {
        runId,
        before,
        state,
        stopped: isTerminal(state.currentNode),
        payment: snapshotPayment(runId),
      };
    },
  );
}
