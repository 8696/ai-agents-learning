/**
 * 职责：调度器走一步并把整份状态写到存档器（Checkpointer）。
 * 数据流：内存里取当前状态 → 跑当前节点 → 路由挑下一站 → 验边 → 写 currentNode → writeCheckpoint → readCheckpoint。
 * 为什么单独成文件：「调度器走一步 + 写入检查点」是主流程（§5.7 强制主流程单独成文件），不和「只写一份」或「只读一份」的存档器操作混在一起。
 * 内存表（runs: Map<runId, state>）也跟着搬过来——它只服务调度器，不服务 readCheckpoint。
 * startRun 也在这里：它在内存里建一件任务运行，磁盘文件要等走完一步才写。
 */
import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import {
  type CafeState,
  type NodeName,
  NODES,
  createInitialState,
  isLegalEdge,
  isTerminal,
  routeAfter,
} from "./cafe-graph.js";
import {
  type CheckpointRecord,
  checkpointFilePath,
  readCheckpoint,
  writeCheckpoint,
} from "./checkpoint-after-step.js";
import { snapshotPayment, type PaymentSnapshot } from "./payment-ledger.js";

export interface StepWriteResult {
  runId: string;
  before: CafeState;
  state: CafeState;
  stopped: boolean;
  checkpoint: CheckpointRecord;
  filePath: string;
  payment: PaymentSnapshot;
}

export interface StartRunResult {
  runId: string;
  state: CafeState;
  checkpointOnDisk: false;
}

const runs = new Map<string, CafeState>();

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

export function getRun(runId: string): CafeState | undefined {
  return runs.get(runId);
}

export function hasRun(runId: string): boolean {
  return runs.has(runId);
}

export function forgetRun(runId: string): boolean {
  return runs.delete(runId);
}

export function putRun(runId: string, state: CafeState): void {
  runs.set(runId, state);
}

export function startRun(drinkName: string): StartRunResult {
  return logCall(
    "开始任务运行",
    "startRun",
    "先在内存里建一件任务运行，磁盘文件要等走完一步才写",
    { drinkName },
    startRun.toString(),
    {
      runId: "新编号，后面走一步、读文件都带它",
      checkpointOnDisk: "这一步开始时固定为 false",
    },
    () => {
      const state = logCall(
        "│ 初始状态",
        "createInitialState",
        "开始时只在内存里放一份可序列化（Serializable）的状态，还不写文件",
        { drinkName },
        createInitialState.toString(),
        {
          currentNode: "一开始停在点单站 takeOrder",
          drinkName: "客人点的那一杯",
        },
        () => createInitialState(drinkName),
      );
      const runId = randomUUID();
      runs.set(runId, state);
      return { runId, state, checkpointOnDisk: false as const };
    },
  );
}

export function stepOnceAndWrite(runId: string, keepHistory: boolean = false): StepWriteResult {
  return logCall(
    "走一步并写入检查点",
    "stepOnceAndWrite",
    "本步核心：调度器走完一步之后立刻调用存档器写入，再从磁盘读回来交给页面",
    { runId, keepHistory },
    stepOnceAndWrite.toString(),
    {
      before: "走这一步之前的状态",
      state: "走完后的新状态，含新的 currentNode",
      checkpoint: "从磁盘读回来的检查点全文",
      filePath: "文件在服务端磁盘上的绝对路径",
      payment: "这一单在支付渠道账本上的调用次数和真实扣款次数",
      keepHistory: "为真时多写一份历史副本到 data/checkpoints/{runId}/step-NNNN.json",
    },
    () => {
      const before = runs.get(runId);
      if (!before) {
        throw Object.assign(
          new Error("内存里找不到这件任务运行。若你刚清空内存或刚重启服务，请先点「从磁盘恢复到内存」。"),
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
        "调度器先跑当前节点，节点只返回要改的字段，不许自己改 currentNode",
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
        "节点跑完后由路由挑下一站；这一步写进检查点的 currentNode 就是这里的返回值",
        { from, drinkType: afterNode.drinkType },
        routeAfter.toString(),
        { next: "写进检查点的当前节点名" },
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
      runs.set(runId, state);

      writeCheckpoint(runId, state, keepHistory);
      const fromDisk = readCheckpoint(runId);
      if (!fromDisk) {
        throw Object.assign(new Error("写入之后立刻读取，磁盘上却没有文件"), { code: "CHECKPOINT_MISSING_AFTER_WRITE" });
      }

      return {
        runId,
        before,
        state,
        stopped: isTerminal(state.currentNode),
        checkpoint: fromDisk,
        filePath: checkpointFilePath(runId),
        payment: snapshotPayment(runId),
      };
    },
  );
}
