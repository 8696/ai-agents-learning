/**
 * 职责：runId → 取消控制器 + 结果的进程内单例（step-4 变体 M 用户取消的核心）。
 *
 * 数据流：
 *   POST /api/agent-run
 *     → routes/agent.ts 生成 runId + new AbortController
 *       → registerRun(runId, controller, startedAt)
 *         → async 启动 runAgentLoop({ ..., signal: controller.signal })
 *           → 跑完 → finishRun(runId, result) 或 errorRun(runId, err)
 *
 *   POST /api/cancel/:runId
 *     → routes/cancel.ts 取 controller → abort("user_cancelled")
 *       → loop.ts 下一次 while 起点检测 signal.aborted → break + stoppedReason="cancelled"
 *         → finishRun 自然把 status 写成 "cancelled"
 *
 *   GET /api/agent-run/:runId
 *     → 前端每 800ms 轮询 → getRun(runId) 拿到当前 status / result
 *       → running → 返 202 + { status, rounds, elapsedMs }
 *       → done / cancelled / error → 返 200 + 完整 result
 *
 * 为什么单独成文件：跨三个路由（start / cancel / status）+ 一个循环（loop.ts）共享状态；
 * 不提到一个文件 = 状态散在四个地方、改一个忘改三个。
 *
 * 教学锚点（变体 M 用户取消 · §5.3.16）：
 *   - 「取消」在 HTTP 层 = AbortController.abort()；传到 OpenAI SDK 的 signal，下一次 LLM 调用立刻抛 AbortError
 *   - 已发出的 tool handler（Promise.all 启动的）**不**被中断 —— 它们的 signal 没传；step-4 不演示
 *     「已发出也能取消」，那要改 lib/tools/todo-tools.ts（不属于本 step 范围）
 *   - 前端轮询模型：「跑中 → 已取消」用 status 字段区分；trajectory 最后一圈标 cancelled 是路由层
 *     在 finishRun 时根据 result.stoppedReason 加的，不污染 lib/flow/loop.ts
 */
import { randomUUID } from "node:crypto";
import type { LoopResult } from "./flow/loop.js";

export type RunStatus = "running" | "done" | "cancelled" | "error";

export type RunState = {
  controller: AbortController;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  /** 终止时的 rounds（用于 polling 时给前端一个「跑到第几圈才被取消」的观察） */
  rounds?: number;
  /** 跑完 / 取消 / 错误 时填入 */
  result?: LoopResult;
  error?: { error: string; message: string };
};

const RUNS = new Map<string, RunState>();

export function newRunId(): string {
  return randomUUID();
}

export function registerRun(runId: string, controller: AbortController): RunState {
  const state: RunState = {
    controller,
    status: "running",
    startedAt: Date.now(),
  };
  RUNS.set(runId, state);
  return state;
}

export function getRun(runId: string): RunState | undefined {
  return RUNS.get(runId);
}

/**
 * loop.ts 退出时调用；根据 result.stoppedReason 把 status 设成 done / cancelled。
 * 注意：cancelled 也走这条路 —— loop 看见 signal.aborted 后自然 break，
 * 写 result.stoppedReason="cancelled" → 这里把 status 转成 "cancelled"。
 */
export function finishRun(runId: string, result: LoopResult): void {
  const s = RUNS.get(runId);
  if (!s) return;
  s.result = result;
  s.rounds = result.rounds;
  s.endedAt = Date.now();
  s.status = result.stoppedReason === "cancelled" ? "cancelled" : "done";
}

/** 真上游失败（getLlm 抛错 / LLM 调不通）→ status=error，error 字段填结构化信息 */
export function errorRun(
  runId: string,
  error: { error: string; message: string }
): void {
  const s = RUNS.get(runId);
  if (!s) return;
  s.status = "error";
  s.error = error;
  s.endedAt = Date.now();
}

/**
 * 取消一个正在跑的 run。**只**触发 abort()，不直接改 status —— 让 loop 自己退出、
 * finishRun 收尾（保证 trajectory 完整写完）。若 runId 不存在或已结束 → 返回 false。
 */
export function cancelRun(runId: string, reason: string = "user_cancelled"): boolean {
  const s = RUNS.get(runId);
  if (!s) return false;
  if (s.status !== "running") return false;
  s.controller.abort(reason);
  return true;
}