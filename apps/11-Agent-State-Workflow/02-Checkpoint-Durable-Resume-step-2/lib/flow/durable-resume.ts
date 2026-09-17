/**
 * 职责：内存空了之后，从磁盘上的检查点（Checkpoint）加载，再从当时那一站继续。
 *
 * 数据流：
 *   forgetRunMemory → 只删内存表，文件不动
 *   resumeFromDisk → readCheckpoint → 写回内存
 *   然后再调 stepOnceAndWrite，currentNode 应是停住的那一站，不是 takeOrder
 *
 * 为什么单独成文件：加载检查点仍是独立步骤；本步新教学点在 charge-crash-before-checkpoint.ts。
 */
import { logger } from "../logger.js";
import { checkpointFilePath, readCheckpoint } from "./checkpoint-after-step.js";
import { forgetRun, hasRun, putRun } from "./step-with-checkpoint.js";

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

export function forgetRunMemory(runId: string) {
  return logCall(
    "清空内存",
    "forgetRunMemory",
    "模拟进程没了：内存表清空，磁盘上的检查点文件还在",
    { runId },
    forgetRunMemory.toString(),
    {
      inMemoryAfter: "清空之后内存里还有没有这一件任务运行",
      filePath: "磁盘文件路径，文件应仍在",
    },
    () => {
      const inMemoryBefore = hasRun(runId);
      forgetRun(runId);
      return {
        runId,
        inMemoryBefore,
        inMemoryAfter: hasRun(runId),
        filePath: checkpointFilePath(runId),
        checkpoint: readCheckpoint(runId),
      };
    },
  );
}

export function resumeFromDisk(runId: string) {
  return logCall(
    "从磁盘恢复",
    "resumeFromDisk",
    "本步核心：新进程内存是空的，只能按任务运行编号从磁盘读回完整快照，再放进内存",
    { runId },
    resumeFromDisk.toString(),
    {
      currentNode: "恢复后应停在写入时的那一站，不是入口 takeOrder",
      inMemoryAfter: "加载成功后内存里应有这一件任务运行",
    },
    () => {
      const record = readCheckpoint(runId);
      if (!record) {
        throw Object.assign(new Error("磁盘上还没有这份检查点。请先走完至少一步再恢复。"), {
          code: "CHECKPOINT_NOT_ON_DISK",
        });
      }
      putRun(runId, record.state);
      return {
        runId,
        inMemoryAfter: hasRun(runId),
        filePath: checkpointFilePath(runId),
        checkpoint: record,
        state: record.state,
      };
    },
  );
}

export function memoryStatus(runId: string) {
  return {
    runId,
    inMemory: hasRun(runId),
    checkpoint: readCheckpoint(runId),
    filePath: checkpointFilePath(runId),
  };
}
