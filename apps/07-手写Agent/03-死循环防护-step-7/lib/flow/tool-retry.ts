/**
 * 职责：闸门 5 · 工具重试上限（变体 5）—— 单次工具调用失败时按指数退避重试，N 次全失败上报给 runLoop 决定是否 break。
 * 数据流：runLoop 调 runWithRetry({ tool, flakyRate, alwaysFail, maxRetries, latencyMs }) → 内部循环调 tool → 失败就 backoff 重试 → 成功返 ok=true / 全失败返 ok=false + failedAttempts。
 * 为什么单独成文件：闸门 5 是「工具层」闸门，不在 while 条件里；抽出来 loop.ts 控 ≤280 行。
 *
 * 入参 / 出参的形状由本文件定义，loop.ts 只调一个函数。
 */
import { logger } from "../logger.js";

export interface RetryResult {
  ok: boolean;
  available?: number;
  latencyMs: number;
  error?: string;
  attempt: number;
  failedAttempts: number;
}

export interface RunWithRetryParams {
  tool: (attempt: number) => Promise<{ ok: boolean; available?: number; latencyMs: number; error?: string }>;
  /** 重试上限（不含首次 = N+1 次尝试） */
  maxRetries: number;
  /** 工具名（用于日志） */
  toolName: string;
  /** 第一轮调工具的入参（用于日志） */
  toolArgs: unknown;
}

export async function runWithRetry(params: RunWithRetryParams): Promise<RetryResult> {
  const { tool, maxRetries, toolName, toolArgs } = params;
  const maxAttempts = maxRetries + 1; // 含首次
  let attempt = 0;
  let failedAttempts = 0;
  let lastError: string | undefined;
  let lastLatency = 0;
  for (attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await tool(attempt);
    lastLatency = r.latencyMs;
    if (r.ok) {
      const result: RetryResult = {
        ok: true,
        available: r.available,
        latencyMs: r.latencyMs,
        attempt,
        failedAttempts,
      };
      if (failedAttempts > 0) {
        logger.info(
          "││ 工具重试",
          `工具 ${toolName} 重试 ${failedAttempts} 次后成功`,
          "为什么写这条日志：闸门 5 生效——网络抖动吸收了，没让 Agent 整个死。当前：attempt=" + attempt + " · failedAttempts=" + failedAttempts,
          { toolName, toolArgs, attempt, failedAttempts },
        );
      }
      return result;
    }
    failedAttempts += 1;
    lastError = r.error;
    if (attempt < maxAttempts) {
      const backoff = 2 ** (attempt - 1) * 50;
      logger.info(
        "││ 工具重试",
        `工具 ${toolName} 失败 · 重试 ${attempt}/${maxAttempts} · 退避 ${backoff}ms`,
        "为什么写这条日志：闸门 5 正在跑——单次失败不算死，等退避后重试。当前：attempt=" + attempt,
        { toolName, toolArgs, attempt, error: r.error, backoffMs: backoff },
      );
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  return { ok: false, latencyMs: lastLatency, error: lastError ?? "unknown", attempt: maxAttempts, failedAttempts };
}