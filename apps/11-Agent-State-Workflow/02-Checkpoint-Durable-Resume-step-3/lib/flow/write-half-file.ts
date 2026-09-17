/**
 * 职责：故意把 data/checkpoints/{runId}.json 写成半截（变体 I · 第四种时机演示）。
 * 数据流：取当前真实记录的字符串 → 截掉一半 → 用 `fs.writeFileSync` 覆盖写回。
 * 为什么单独成文件：演示「写到一半断电」是需求 7 的入口；不能让页面自己拼字符串。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../logger.js";
import { checkpointFilePath } from "./checkpoint-after-step.js";

const here = path.dirname(fileURLToPath(import.meta.url));

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

export interface HalfWriteResult {
  runId: string;
  filePath: string;
  originalLength: number;
  truncatedLength: number;
  truncatedHead: string;
  truncatedTail: string;
  wroteAt: string;
}

export function writeHalfCheckpointFile(runId: string): HalfWriteResult {
  return logCall(
    "存档器-故意写半份",
    "writeHalfCheckpointFile",
    "变体 I · 第四种时机：模拟存档写到一半断电——主文件只剩残片，但 step-NNNN 历史副本仍完整",
    { runId },
    writeHalfCheckpointFile.toString(),
    {
      originalLength: "截断前主文件完整内容的字节数",
      truncatedLength: "截断后残片的字节数（应约为原长一半）",
      truncatedHead: "残片头部 60 字，证明 JSON.parse 一定会失败",
      truncatedTail: "残片尾部 60 字",
    },
    () => {
      const filePath = checkpointFilePath(runId);
      if (!fs.existsSync(filePath)) {
        throw Object.assign(
          new Error("磁盘上还没有主文件。请先开件并至少走一步（同时保留历史副本），再模拟写到一半。"),
          { code: "CHECKPOINT_NOT_ON_DISK" },
        );
      }
      const original = fs.readFileSync(filePath, "utf8");
      const cut = Math.max(1, Math.floor(original.length / 2));
      const truncated = original.slice(0, cut);
      fs.writeFileSync(filePath, truncated, "utf8");
      return {
        runId,
        filePath,
        originalLength: original.length,
        truncatedLength: truncated.length,
        truncatedHead: truncated.slice(0, 60),
        truncatedTail: truncated.slice(Math.max(0, truncated.length - 60)),
        wroteAt: new Date().toISOString(),
      };
    },
  );
}

export { here as _here };
