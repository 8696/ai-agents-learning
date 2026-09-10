/**
 * 职责：进程内运行的 runLoop 句柄表（runId → { controller, promise }）—— 给 user-cancel route 用。
 * 数据流：起跑时 register({ runId, controller, promise })；用户取消时取出 controller.abort()；跑完 finalize。
 * 为什么单独成文件：状态要跨 route（run / cancel）共享，且要避免 module-level 全局变量被多进程/多用户踩。
 *
 * §5.3.12「禁止全局共享 KV」反例：进程级 state 必须按 userId 隔离；本 demo 单用户故用 `default` 占位。
 */
import { logger } from "../lib/logger.js";
import type { RunLoopOutput } from "../lib/flow/loop.js";

/** routes 包 runLoop 的返回值：成功返 { ok:true, result }，抛错 catch 后返 { ok:false, error }。 */
export type RunResult = { ok: true; result: RunLoopOutput } | { ok: false; error: string };

/** 实时进度：每步由 loop.ts 通过 onProgress 推过来，run-status route 直接读给前端。 */
export interface RunProgress {
  /** 当前正在跑第几步（0 = 启动中；1+ = 第 N 步进行中或已结束） */
  currentStep: number;
  /** 累计 token 估算（同步自 state.tokenEstimate） */
  totalTokens: number;
  /** 累计调用模型次数（每步 1 次） */
  apiCalls: number;
  /** 最后动作描述（调模型 / 调工具 / 闸门触发） */
  lastAction: string;
}

interface RunHandle {
  controller: AbortController;
  promise: Promise<RunResult>;
  finished: boolean;
  /** 拿 runId 时填进去；用户取消时不再返回结果，runWithCancel 把 cancel 当成终结信号。 */
  aborted: boolean;
  /** 实时进度（loop.ts 每步推一次；前端轮询时拿到；finished=true 后冻结最后状态） */
  progress: RunProgress | null;
}

const handles = new Map<string, RunHandle>();

export function registerRun(runId: string, controller: AbortController, promise: Promise<RunResult>): void {
  handles.set(runId, { controller, promise, finished: false, aborted: false, progress: null });
}

/** loop.ts 通过 onProgress 推过来；前端 GET run-status 拿。finished=true 后不再覆盖（保留最后一次）。 */
export function setRunProgress(runId: string, progress: RunProgress): void {
  const h = handles.get(runId);
  if (!h) return;
  if (h.finished) return;
  h.progress = progress;
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