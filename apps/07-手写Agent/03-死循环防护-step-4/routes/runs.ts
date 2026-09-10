/**
 * 职责：进程内运行的 runLoop 句柄表（runId → { controller, promise }）—— 给 user-cancel route 用。
 * 数据流：起跑时 register({ runId, controller, promise })；用户取消时取出 controller.abort()；跑完 finalize。
 * 为什么单独成文件：状态要跨 route（run / cancel）共享，且要避免 module-level 全局变量被多进程/多用户踩。
 *
 * §5.3.12「禁止全局共享 KV」反例：进程级 state 必须按 userId 隔离；本 demo 单用户故用 `default` 占位。
 */
import { logger } from "../lib/logger.js";

interface RunHandle {
  controller: AbortController;
  promise: Promise<unknown>;
  finished: boolean;
  /** 拿 runId 时填进去；用户取消时不再返回结果，runWithCancel 把 cancel 当成终结信号。 */
  aborted: boolean;
}

const handles = new Map<string, RunHandle>();

export function registerRun(runId: string, controller: AbortController, promise: Promise<unknown>): void {
  handles.set(runId, { controller, promise, finished: false, aborted: false });
}

export function abortRun(runId: string): { ok: boolean; reason: string } {
  const h = handles.get(runId);
  if (!h) return { ok: false, reason: `找不到 runId=${runId}（可能已结束 / 不存在）` };
  if (h.finished) return { ok: false, reason: `runId=${runId} 已结束，无需取消` };
  h.controller.abort("用户取消（点击「取消」按钮 / 页面关闭）");
  h.aborted = true;
  logger.info(
    "用户取消-handle",
    "调用函数开始：abortRun",
    "为什么写这条日志：用户取消闸的真发信号——abort() 让 while 条件里的 abortSignal.aborted 变 true。当前：runId=" + runId,
    { 入参: { runId }, __code: "h.controller.abort('用户取消（点击「取消」按钮 / 页面关闭）');" },
  );
  return { ok: true, reason: "已发送 abort 信号" };
}

export function finalizeRun(runId: string): void {
  const h = handles.get(runId);
  if (h) h.finished = true;
}

export function getRunHandle(runId: string): RunHandle | undefined {
  return handles.get(runId);
}