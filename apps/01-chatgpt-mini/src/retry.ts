/**
 * apps/01-chatgpt-mini · 退避重试客户端（429 / 5xx / 网络错）
 *
 * 职责：把 chat.completions 的 HTTP 调用包成分类重试 + 指数退避 + jitter + Retry-After。
 *       本条回填最小一刀：只在 src/index.ts 一处套用（CLI 协议 A 流式入口）。
 *       server.ts（HTTP + SSE）与 index-anthropic.ts（协议 B）留到模块 02 本地产出收口。
 *
 * 错误分类：
 *   - 不可重试：400 / 401 / 403 / 404 / 422 → 直接抛 NonRetryableError，不重试
 *   - 可重试：429 / 408 / 5xx / 网络错 → 指数退避 + jitter + 听 Retry-After + 上限后抛 RetryExhaustedError
 *
 * 为什么不抽共享包：AGENTS.md §5 明确要求每个 app 自己复制（避免五个 app 互依赖）。
 * 为什么不直接用 OpenAI SDK 自带 retry：
 *   - SDK 默认 maxRetries=2，但不听 Retry-After
 *   - 没有错误分类表（401 也被它重试 = 浪费钱 + 浪费时间）
 *   - 没有 jitter（多 worker 撞 thundering herd）
 *   - 不可重试和可重试混在一起抛，调用方难判断走哪条降级路径
 *
 * 概念 / 取舍 / 踩坑：docs/学习模块/02-LLM-API开发/04-Rate-Limit.md
 * 同源 demo（验证 5 个场景）：demos/02-LLM-API开发/04-Rate-Limit/retry.ts
 */

import { performance } from "node:perf_hooks";

// ── 错误分类表 ────────────────────────────────────────────────
/** 不可重试：重试只会得到同一个错（浪费时间 + 浪费配额 + 浪费钱） */
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 422]);
// 可重试集合 = 隐式：429 / 408 / 5xx / 网络错。不显式列，方便新增可重试码不用改。

/** 不可重试错误：上层 catch 后立刻停手，不再走重试循环 */
export class NonRetryableError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`NonRetryableError: HTTP ${status} ${body.slice(0, 80)}`);
    this.name = "NonRetryableError";
  }
}

/** 重试耗尽错误：所有 attempt 都失败且没抛 NonRetryableError */
export class RetryExhaustedError extends Error {
  constructor(public readonly attempts: AttemptRecord[]) {
    super(
      `RetryExhaustedError: ${attempts.length} attempts, last status = ${attempts.at(-1)?.status}`,
    );
    this.name = "RetryExhaustedError";
  }
}

/** 单次 attempt 全部信息（CLI / 调试打印用） */
export interface AttemptRecord {
  attempt: number;
  status: number | "network";
  waitBeforeMs: number;
  retryAfterUsedMs: number | null;
  durationMs: number;
  errorMessage?: string;
}

/** retryWithBackoff 的可调参数 */
export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxTotalTimeMs: number;
  jitter: boolean;
  /** 外部 abort 信号（如上游用户取消定时器）；aborted 时立刻停手，不重试 */
  signal?: AbortSignal;
}

/** 项目默认参数：LLM 一次响应 5~30s，比 demo 给宽 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  maxTotalTimeMs: 60_000,
  jitter: true,
};

/** Retry-After 头转毫秒（支持整数秒 / 浮点秒 / HTTP-date） */
export function parseRetryAfter(header: string): number {
  const trimmed = header.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.ceil(parseFloat(trimmed) * 1000);
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? Math.max(0, ms - Date.now()) : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 业务侧要发的请求；返回 status + body + headers。
 *  body 在 2xx 时是泛型 T（流式 / 非流式都行）；非 2xx 时是 string（错误信息）。
 *  这样 OpenAI SDK 的 APIError（body=string）和成功流（body=Stream）能在同一签名里表达。
 */
export type RequestFn<T> = (signal: AbortSignal) => Promise<{
  status: number;
  body: T | string;
  headers: Headers;
}>;

/**
 * retryWithBackoff 主入口。
 *   - 成功：return { result, attempts }
 *   - 不可重试（4xx 非 408 / 422）：throw NonRetryableError
 *   - 重试耗尽：throw RetryExhaustedError
 *   - 外部 signal aborted：throw（abort 错误，外层 catch 按 AbortError 处理）
 */
export async function retryWithBackoff<T>(
  fn: RequestFn<T>,
  opts: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<{ result: T; attempts: AttemptRecord[] }> {
  const start = performance.now();
  const attempts: AttemptRecord[] = [];
  let prevWaitMs = 0;

  for (let i = 0; i < opts.maxAttempts; i++) {
    const attemptNo = i + 1;

    // 外部 abort 检查：先看外部信号（用户取消 / 超时）
    if (opts.signal?.aborted) {
      throw new DOMException("aborted before attempt " + attemptNo, "AbortError");
    }

    // 总耗时上限
    const elapsed = performance.now() - start;
    if (elapsed >= opts.maxTotalTimeMs) {
      throw new Error(
        `maxTotalTime exceeded before attempt ${attemptNo} (${elapsed.toFixed(0)}ms / ${opts.maxTotalTimeMs}ms)`,
      );
    }

    const attemptStart = performance.now();
    let status: number | "network" = "network";
    let retryAfterUsedMs: number | null = null;
    let errorMessage: string | undefined;
    let successBody: T | null = null;
    let succeeded = false;

    // 给每次 attempt 单独建一个 controller；外部信号 abort 时同步 abort 内部
    const inner = new AbortController();
    let onOuterAbort: (() => void) | null = null;
    if (opts.signal) {
      if (opts.signal.aborted) inner.abort();
      else {
        onOuterAbort = () => inner.abort();
        opts.signal.addEventListener("abort", onOuterAbort, { once: true });
      }
    }

    try {
      const resp = await fn(inner.signal);
      status = resp.status;
      const retryAfterHeader = resp.headers.get("retry-after");
      if (retryAfterHeader) retryAfterUsedMs = parseRetryAfter(retryAfterHeader);

      if (resp.status >= 200 && resp.status < 300) {
        // 2xx → body 一定是 T
        successBody = resp.body as T;
        succeeded = true;
      } else if (NON_RETRYABLE_STATUS.has(resp.status)) {
        attempts.push({
          attempt: attemptNo,
          status: resp.status,
          waitBeforeMs: prevWaitMs,
          retryAfterUsedMs,
          durationMs: performance.now() - attemptStart,
          errorMessage: bodyToString(resp.body).slice(0, 80),
        });
        throw new NonRetryableError(resp.status, bodyToString(resp.body));
      }
      // 可重试失败 → fall through
      errorMessage = bodyToString(resp.body).slice(0, 80);
    } catch (err) {
      // NonRetryableError：原样抛，不再 retry
      if (err instanceof NonRetryableError) throw err;
      // 外部 abort 触发的 AbortError：原样抛，让上层按"用户取消"处理
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // 网络错 / 其他异常：当作可重试
      status = "network";
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      if (onOuterAbort && opts.signal) {
        opts.signal.removeEventListener("abort", onOuterAbort);
      }
      inner.abort();
    }

    attempts.push({
      attempt: attemptNo,
      status,
      waitBeforeMs: prevWaitMs,
      retryAfterUsedMs,
      durationMs: performance.now() - attemptStart,
      errorMessage,
    });

    if (succeeded && successBody !== null) {
      return { result: successBody, attempts };
    }

    // 最后一次不需要 sleep
    if (i === opts.maxAttempts - 1) break;

    // 算下次等待时长：max(exponential + jitter, Retry-After)
    const exponential = Math.min(opts.baseDelayMs * 2 ** i, opts.maxDelayMs);
    const jitterMs = opts.jitter ? Math.random() * opts.baseDelayMs : 0;
    const exponentialWithJitter = Math.min(exponential + jitterMs, opts.maxDelayMs);
    const retryAfterMs = retryAfterUsedMs ?? 0;
    const waitMs = Math.max(exponentialWithJitter, retryAfterMs);
    prevWaitMs = waitMs;

    // 总耗时上限（睡眠期间也可能超）
    if (performance.now() - start + waitMs >= opts.maxTotalTimeMs) {
      throw new Error(
        `maxTotalTime would be exceeded by next wait (${(performance.now() - start).toFixed(0)}ms + ${waitMs.toFixed(0)}ms / ${opts.maxTotalTimeMs}ms)`,
      );
    }

    await sleep(waitMs);
  }

  throw new RetryExhaustedError(attempts);
}

/** 把任意 body 转字符串（用于错误信息） */
function bodyToString(body: unknown): string {
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}
