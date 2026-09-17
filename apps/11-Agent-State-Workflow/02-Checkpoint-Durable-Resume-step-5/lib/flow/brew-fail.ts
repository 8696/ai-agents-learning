/**
 * 职责：在内存里把这一件任务运行（runId）的 brewFailOnStep 标志设上。走 brewHot / brewIced 时见到这个标志就故意写 lastError、沿失败边走 brewFailed。
 * 数据流：查内存 → 设标志 → 写回内存。**不**走节点函数，**不**写磁盘。
 * 为什么单独成文件：节点失败 = 进程还在、lastError 写入、走 fail 边；这个标志是「下一次走 brewHot 故意失败」的开关，要单独给页面用。
 */
import { logger } from "../logger.js";
import { getRun, putRun } from "./step-with-checkpoint.js";
import { type CafeState } from "./cafe-graph.js";

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

export function setBrewFailFlag(runId: string): CafeState {
  return logCall(
    "节点失败-设置标志",
    "setBrewFailFlag",
    "变体 G 之外的「节点失败 ≠ 进程被杀掉」对照：把 brewFailOnStep 标志设上，**不**调节点函数、**不**写磁盘——下一次走 brewHot 时让节点优雅地写 lastError 沿失败边走",
    { runId },
    setBrewFailFlag.toString(),
    {
      runId: "这一件任务运行的编号",
      brewFailOnStep: "为 true 时，下一次走 brewHot / brewIced 节点会写 lastError",
    },
    () => {
      const before = getRun(runId);
      if (!before) {
        throw Object.assign(
          new Error("内存里找不到这件任务运行。请先开始并走到 brewHot 之前。"),
          { code: "RUN_NOT_FOUND" },
        );
      }
      const next: CafeState = { ...before, brewFailOnStep: true };
      putRun(runId, next);
      return next;
    },
  );
}
