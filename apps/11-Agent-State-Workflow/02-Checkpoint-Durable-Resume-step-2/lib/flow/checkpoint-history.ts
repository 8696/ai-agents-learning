/**
 * 职责：列出某一任务运行（runId）在存档目录里的所有检查点（Checkpoint）历史。
 * 数据流：扫两种布局——
 *   新布局（启用 keepHistory 之后）：data/checkpoints/{runId}/step-0000.json / step-0001.json …
 *   旧布局（默认）：data/checkpoints/{runId}.json 一份最新
 * 每一份都尝试 JSON.parse；JSON.parse 抛错或缺关键字段时，记 parseError，仍放进数组里给页面看。
 * 为什么单独成文件：和「写一份」「读一份」分开；本函数是只读 + 列目录。
 *
 * 教学点：变体 G（只认最新完整快照，历史仅对照）+ 变体 H（恢复 vs 重放）。
 *   引擎恢复仍走 readCheckpoint 读最新完整份；listCheckpoints 只是给页面看时间线。
 *   本函数不返回「下一站跑哪一步」——只看历史，不重放。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";
import { checkpointFilePath, CHECKPOINT_DIR_HERE } from "./checkpoint-after-step.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export interface CheckpointHistoryItem {
  fileName: string;
  filePath: string;
  runId: string;
  currentNode: string;
  writtenAt: string;
  completedCount: number;
  isLatestComplete: boolean;
  parseError: string | null;
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

function safeParseRecord(filePath: string, runId: string, fileName: string): CheckpointHistoryItem {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      fileName,
      filePath,
      runId,
      currentNode: "—",
      writtenAt: "—",
      completedCount: 0,
      isLatestComplete: false,
      parseError: "读文件失败：" + message,
    };
  }
  try {
    const obj = JSON.parse(raw) as {
      runId?: unknown;
      currentNode?: unknown;
      writtenAt?: unknown;
      state?: { completedNodes?: unknown };
    };
    const stateObj = obj.state;
    const completed = Array.isArray(stateObj ? stateObj.completedNodes : undefined)
      ? ((stateObj as { completedNodes: unknown }).completedNodes as unknown[]).length
      : 0;
    return {
      fileName,
      filePath,
      runId: typeof obj.runId === "string" ? obj.runId : runId,
      currentNode: typeof obj.currentNode === "string" ? obj.currentNode : "—",
      writtenAt: typeof obj.writtenAt === "string" ? obj.writtenAt : "—",
      completedCount: completed,
      isLatestComplete: true,
      parseError: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      fileName,
      filePath,
      runId,
      currentNode: "—",
      writtenAt: "—",
      completedCount: 0,
      isLatestComplete: false,
      parseError: "JSON.parse 失败：" + message,
    };
  }
}

export function listCheckpoints(runId: string): CheckpointHistoryItem[] {
  return logCall(
    "存档器-列出历史",
    "listCheckpoints",
    "扫存档目录里这一任务运行编号的所有检查点历史，给页面看时间线；不重放",
    { runId },
    listCheckpoints.toString(),
    {
      fileName: "磁盘上这份文件的文件名",
      currentNode: "写入时的当前节点",
      writtenAt: "写入时刻（ISO）",
      completedCount: "这一步已经跑完的节点数",
      isLatestComplete: "是否能 JSON.parse 成功；false 时 parseError 有内容",
      parseError: "读文件或 JSON.parse 失败的原因；OK 时为 null",
    },
    () => {
      const items: CheckpointHistoryItem[] = [];

      // 新布局：data/checkpoints/{runId}/step-NNNN.json
      const histDir = path.join(CHECKPOINT_DIR_HERE, runId);
      if (fs.existsSync(histDir) && fs.statSync(histDir).isDirectory()) {
        const names = fs.readdirSync(histDir).filter(function (n) {
          return n.endsWith(".json");
        });
        names.sort();
        for (const name of names) {
          items.push(safeParseRecord(path.join(histDir, name), runId, name));
        }
      }

      // 旧布局：data/checkpoints/{runId}.json（仅当新布局没东西时列它）
      if (items.length === 0) {
        const singlePath = checkpointFilePath(runId);
        if (fs.existsSync(singlePath)) {
          items.push(safeParseRecord(singlePath, runId, runId + ".json"));
        }
      }

      return items;
    },
  );
}

export function getHistoryDir(runId: string): string {
  return path.join(CHECKPOINT_DIR_HERE, runId);
}

export { here as _here };
