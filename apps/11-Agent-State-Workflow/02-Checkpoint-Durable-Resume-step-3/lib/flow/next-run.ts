/**
 * 职责：上一件任务运行到终止站（okEnd）后，开新业务（生成新 runId）；可挂 parentRunId 引用上一件。
 * 教学目的：变体 F · 终态判定 + 做法 1/2。
 * 数据流：
 *   无 previousRunId → 直接调 startRun，parentRunId 不挂
 *   有 previousRunId → readCheckpoint 读磁盘上的最后一份快照；isTerminal(state.currentNode) === "okEnd"
 *     · 是 → 调 startRun(drinkName) + 把 parentRunId 挂到响应里
 *     · 否 → 抛 NEXT_RUN_BEFORE_DONE：上一件还没走到完成
 * 为什么单独成文件：终态判定 + parentRunId 钩子是变体 F 的核心；和「单纯开新单」拆开让页面讲得清。
 */
import { logger } from "../logger.js";
import { isTerminal, type CafeState } from "./cafe-graph.js";
import { readCheckpoint, type CheckpointRecord } from "./checkpoint-after-step.js";
import { startRun, type StartRunResult } from "./step-with-checkpoint.js";

export interface NextRunResult extends StartRunResult {
  parentRunId: string | null;
  previousRunFinalSnapshot: CheckpointRecord | null;
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

export function nextRun(args: {
  previousRunId: string | null;
  drinkName: string;
}): NextRunResult {
  return logCall(
    "开下一件业务",
    "nextRun",
    "变体 F · 做法 1/2：上一件到 okEnd 后，新业务用新 runId；可选挂 parentRunId 引用上一件",
    { previousRunId: args.previousRunId, drinkName: args.drinkName },
    nextRun.toString(),
    {
      runId: "新一件任务运行的编号（与 previousRunId 不同）",
      parentRunId: "为 null 时：默认做法 1；非 null 时：做法 2，引用上一件检查点",
      previousRunFinalSnapshot: "上一件最后一份完整检查点；非 null 时证明上一件真的走到了 okEnd",
    },
    () => {
      if (!args.previousRunId) {
        const fresh = startRun(args.drinkName);
        return {
          runId: fresh.runId,
          state: fresh.state,
          checkpointOnDisk: fresh.checkpointOnDisk,
          parentRunId: null,
          previousRunFinalSnapshot: null,
        };
      }

      const previous = readCheckpoint(args.previousRunId);
      if (!previous) {
        throw Object.assign(
          new Error("上一件在磁盘上没有检查点。请先走完至少一步再开下一件。"),
          { code: "PREVIOUS_RUN_NO_CHECKPOINT" },
        );
      }
      const previousState: CafeState = previous.state;
      if (!isTerminal(previousState.currentNode)) {
        throw Object.assign(
          new Error(
            `上一件还停在 ${previousState.currentNode}，没到终止站 okEnd。请先把它走完（或换一件）再开下一件。`,
          ),
          { code: "NEXT_RUN_BEFORE_DONE" },
        );
      }

      const fresh = startRun(args.drinkName);
      return {
        runId: fresh.runId,
        state: fresh.state,
        checkpointOnDisk: fresh.checkpointOnDisk,
        parentRunId: args.previousRunId,
        previousRunFinalSnapshot: previous,
      };
    },
  );
}
