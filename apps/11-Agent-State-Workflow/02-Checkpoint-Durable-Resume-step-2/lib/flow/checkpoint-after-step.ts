/**
 * 职责：存档器（Checkpointer）—— 把状态写成磁盘上的检查点（Checkpoint），按任务运行编号读回。
 * 数据流：
 *   writeCheckpoint → 序列化整份状态，覆盖写入 data/checkpoints/{runId}.json；keepHistory 为真时再多写一份 data/checkpoints/{runId}/step-NNNN.json
 *   readCheckpoint → 只读磁盘，内存不参与
 * 调度器走一步 + 写盘在 step-with-checkpoint.ts；持久恢复在 durable-resume.ts；故意不写在 charge-crash-before-checkpoint.ts。
 * 为什么单独成文件：写入检查点这一层只服务存档器，不掺进调度器或主流程。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";
import { type CafeState, type NodeName } from "./cafe-graph.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_DIR = path.resolve(here, "..", "..", "data", "checkpoints");
export const CHECKPOINT_DIR_HERE = CHECKPOINT_DIR;

export interface CheckpointRecord {
  runId: string;
  currentNode: NodeName;
  state: CafeState;
  writtenAt: string;
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

export function getCheckpointDir(): string {
  return CHECKPOINT_DIR;
}

export function checkpointFilePath(runId: string): string {
  return path.join(CHECKPOINT_DIR, `${runId}.json`);
}

export function writeCheckpoint(
  runId: string,
  state: CafeState,
  keepHistory: boolean = false,
): CheckpointRecord {
  return logCall(
    "│ 存档器-写入检查点",
    "writeCheckpoint",
    "走完一步之后必须把状态写到进程外面的文件里，页面才能看见磁盘上的检查点",
    { runId, state, keepHistory },
    writeCheckpoint.toString(),
    {
      runId: "这一件任务运行的编号",
      currentNode: "写入时的当前节点",
      state: "当时整份状态对象；keepHistory 为真时另写一份历史副本",
      writtenAt: "写入时刻（ISO）",
    },
    () => {
      fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
      const record: CheckpointRecord = {
        runId,
        currentNode: state.currentNode,
        state,
        writtenAt: new Date().toISOString(),
      };
      fs.writeFileSync(checkpointFilePath(runId), JSON.stringify(record, null, 2), "utf8");
      if (keepHistory) {
        const stepNo = String(state.completedNodes.length).padStart(4, "0");
        fs.mkdirSync(path.join(CHECKPOINT_DIR, runId), { recursive: true });
        fs.writeFileSync(
          path.join(CHECKPOINT_DIR, runId, `step-${stepNo}.json`),
          JSON.stringify(record, null, 2),
          "utf8",
        );
      }
      return record;
    },
  );
}

export function readCheckpoint(runId: string): CheckpointRecord | null {
  return logCall(
    "│ 存档器-读取检查点",
    "readCheckpoint",
    "从磁盘读回刚才写入的文件，证明页面上的 JSON 不是只在内存里编的",
    { runId },
    readCheckpoint.toString(),
    {
      runId: "按哪一个任务运行编号去找文件",
      fileMissing: "磁盘上还没有这份文件时返回 null",
    },
    () => {
      const filePath = checkpointFilePath(runId);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, "utf8");
      return JSON.parse(raw) as CheckpointRecord;
    },
  );
}
