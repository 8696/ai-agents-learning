/**
 * 职责：存档器（Checkpointer）—— 把状态写成磁盘上的检查点（Checkpoint），按任务运行编号读回。
 * 数据流：
 *   writeCheckpoint → 序列化整份状态，覆盖写入 data/checkpoints/{runId}.json；keepHistory 为真时再多写一份 data/checkpoints/{runId}/step-NNNN.json
 *   readCheckpoint → 主文件优先；parse 失败时按编号降序 fallback 到 data/checkpoints/{runId}/step-NNNN.json（变体 I · 第四种时机）
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
  fellBackTo?: string | null;
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
    "从磁盘读回刚写入的文件；主文件损坏时按编号降序 fallback 到历史副本（变体 I · 第四种时机）",
    { runId },
    readCheckpoint.toString(),
    {
      runId: "按哪一个任务运行编号去找文件",
      fileMissing: "主文件 + 历史副本都不可解析时返回 null",
      fellBackTo: "为非空时，说明主文件 parse 失败、回退到了这一步历史副本",
    },
    () => {
      const mainPath = checkpointFilePath(runId);
      const main = tryReadParse(mainPath);
      if (main) return { ...main, fellBackTo: null };
      // 主文件不存在或 parse 失败 → 在 data/checkpoints/{runId}/ 下找最近一份 step-NNNN.json
      const histDir = path.join(CHECKPOINT_DIR, runId);
      if (!fs.existsSync(histDir) || !fs.statSync(histDir).isDirectory()) return null;
      const names = fs
        .readdirSync(histDir)
        .filter((n) => n.endsWith(".json"))
        .sort()
        .reverse();
      for (const name of names) {
        const rec = tryReadParse(path.join(histDir, name));
        if (rec) return { ...rec, fellBackTo: name };
      }
      return null;
    },
  );
}

function tryReadParse(filePath: string): CheckpointRecord | null {
  if (!fs.existsSync(filePath)) return null;
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    return null;
  }
  try {
    return JSON.parse(raw) as CheckpointRecord;
  } catch (_err) {
    return null;
  }
}
