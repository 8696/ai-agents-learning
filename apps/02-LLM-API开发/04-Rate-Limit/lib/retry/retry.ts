/**
 * 职责：把「分类重试 + 指数退避 + jitter + Retry-After + 上限」做成一个可复用函数，
 *       跑完返回 attempts 时间线，让 demo 能直接打印 / 渲染。
 * 数据流：
 *   fn(signal) → response → 分类（成功 / 可重试失败 / 不可重试 / 网络错）
 *     → 成功：return { result, attempts }
 *     → 不可重试：throw NonRetryableError（不再 retry）
 *     → 可重试 / 网络错：记录 attempt → 算 wait → sleep → 下一轮
 *
 * 不调云端 API；只关心 HTTP 行为 → 与同目录 mock server 配套使用
 * （也可以接到真 LLM 客户端外面套一层）。
 *
 * 为什么这样写：
 *   - 错误分两类：可重试（429/408/5xx/网络错）和 不可重试（400/401/403/404/422）。
 *     不可重试直接抛 NonRetryableError，不浪费钱 / 不浪费配额。
 *   - 等待时长 = max(Retry-After, base * 2^attempt) + jitter（0~baseDelayMs 随机偏移）。
 *   - 双上限：maxAttempts（最多试几次）+ maxTotalTimeMs（总耗时上限），超时立刻抛。
 *   - 每次 attempt 记入 attempts[]，包括状态码 / 等待 / 耗时 / 错误摘要，
 *     便于 console 打印时间线和浏览器渲染。
 *
 * 易混点：
 *   - Retry-After 是**秒**或 HTTP-date，不是毫秒；parseRetryAfter 里转一下。
 *   - jitter 必须等**算完 exponential** 之后再加，不能加在 Retry-After 上（服务端给的不能抖）。
 *   - maxAttempts 含首次；maxAttempts=4 表示最多试 4 次（含首次）。
 */

import { performance } from "node:perf_hooks";

// ── 1) 错误分类表 ────────────────────────────────────────────────
/**
 * 可重试集合：429 / 408 / 5xx / 网络错 = 隐式可重试
 * 不可重试集合：400 / 401 / 403 / 404 / 422 = 直接抛 NonRetryableError
 *
 * 不显式列 RETRYABLE_STATUS：只要不在 NON_RETRYABLE_STATUS 里、且不是 2xx，
 * 就当作可重试。这样新增可重试状态码（如 425 Too Early）不用改代码。
 */
/** 不可重试：重试只会得到同一个错（浪费时间 + 浪费配额 + 浪费钱） */
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 422]);

/** 不可重试错误（让上层 catch 后立刻停手，不再走重试循环） */
export class NonRetryableError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`NonRetryableError: HTTP ${status} ${body.slice(0, 80)}`);
    this.name = "NonRetryableError";
  }
}

/** 单次 attempt 的全部信息（demo 时间线渲染用） */
export interface AttemptRecord {
  /** 第几次（1-indexed） */
  attempt: number;
  /** 状态码；网络错 / 抛异常时为 "network" */
  status: number | "network";
  /** 本次 attempt 开始前等了多久（attempt 1 必为 0） */
  waitBeforeMs: number;
  /** 服务端 Retry-After 头转成的毫秒数（若有） */
  retryAfterUsedMs: number | null;
  /** 本次 attempt 自身耗时（从发出请求到拿到响应） */
  durationMs: number;
  /** 非 2xx 的 body 摘要 / 异常 message */
  errorMessage?: string;
}

/** retryWithBackoff 的可调参数 */
export interface RetryOptions {
  /** 最多尝试几次（含首次）；超过就抛 RetryExhaustedError */
  maxAttempts: number;
  /** 退避基数（毫秒）；实际等待 = base * 2^(attempt-1)，封顶到 maxDelayMs */
  baseDelayMs: number;
  /** 单次退避上限（毫秒） */
  maxDelayMs: number;
  /** 总耗时上限（毫秒）；超过立刻抛，不等最后一次 attempt */
  maxTotalTimeMs: number;
  /** 是否加 jitter（0~baseDelayMs 的随机偏移），防 thundering herd */
  jitter: boolean;
}

/** 默认参数：演示用偏小（maxAttempts=4、base=200ms、maxDelay=2s） */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 4,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  maxTotalTimeMs: 10_000,
  jitter: true,
};

/** Retry-After 头转毫秒（支持整数秒、浮点秒、HTTP-date） */
export function parseRetryAfter(header: string): number {
  const trimmed = header.trim();
  // 整数或浮点秒
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.ceil(parseFloat(trimmed) * 1000);
  }
  // HTTP-date
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? Math.max(0, ms - Date.now()) : 0;
}

/** 同步 sleep */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 业务侧要发的请求；返回 status + body + headers */
export type RequestFn = (signal: AbortSignal) => Promise<{
  status: number;
  body: string;
  headers: Headers;
}>;

/** 重试耗尽错误 */
export class RetryExhaustedError extends Error {
  constructor(public readonly attempts: AttemptRecord[]) {
    super(`RetryExhaustedError: ${attempts.length} attempts, last status = ${attempts.at(-1)?.status}`);
    this.name = "RetryExhaustedError";
  }
}

/** retryWithBackoff 主入口 */
export async function retryWithBackoff(
  fn: RequestFn,
  opts: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<{ result: string; attempts: AttemptRecord[] }> {
  const start = performance.now();
  const attempts: AttemptRecord[] = [];
  let prevWaitMs = 0; // 上一轮算出来的实际等待；attempt 1 = 0

  for (let i = 0; i < opts.maxAttempts; i++) {
    const attemptNo = i + 1;

    // 总耗时上限：开始下一次 attempt 之前先看
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
    let successBody: string | null = null;
    let succeeded = false;

    try {
      // 给每次 attempt 单独建一个 controller；本轮结束（包括决定 retry）
      // 之后立即 abort 掉，避免底层 socket 残留。
      const controller = new AbortController();
      const resp = await fn(controller.signal);
      status = resp.status;
      const retryAfterHeader = resp.headers.get("retry-after");
      if (retryAfterHeader) {
        retryAfterUsedMs = parseRetryAfter(retryAfterHeader);
      }

      if (resp.status >= 200 && resp.status < 300) {
        successBody = resp.body;
        succeeded = true;
      } else if (NON_RETRYABLE_STATUS.has(resp.status)) {
        // 不可重试 → 记 attempt 后直接抛
        attempts.push({
          attempt: attemptNo,
          status: resp.status,
          waitBeforeMs: prevWaitMs,
          retryAfterUsedMs,
          durationMs: performance.now() - attemptStart,
          errorMessage: resp.body.slice(0, 80),
        });
        throw new NonRetryableError(resp.status, resp.body);
      }
      // 可重试的失败（429 / 5xx）→ fall through 到下面的 retry 逻辑
      errorMessage = resp.body.slice(0, 80);
    } catch (err) {
      // NonRetryableError：原样抛，不再 retry
      if (err instanceof NonRetryableError) throw err;
      // 网络错 / 其他异常：当作可重试
      status = "network";
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    // 记本次 attempt
    attempts.push({
      attempt: attemptNo,
      status,
      waitBeforeMs: prevWaitMs,
      retryAfterUsedMs,
      durationMs: performance.now() - attemptStart,
      errorMessage,
    });

    // 成功 → 返回
    if (succeeded && successBody !== null) {
      return { result: successBody, attempts };
    }

    // 最后一次不需要 sleep（马上跳出循环）
    if (i === opts.maxAttempts - 1) break;

    // 算下次等待时长
    //   exponential = base * 2^i，封顶到 maxDelayMs
    //   jitter     = 0~baseDelayMs 随机偏移（防 thundering herd）
    //   retryAfter = 服务端 Retry-After 头
    //   最终 = max(exponential + jitter, retryAfter)
    const exponential = Math.min(opts.baseDelayMs * 2 ** i, opts.maxDelayMs);
    const jitterMs = opts.jitter ? Math.random() * opts.baseDelayMs : 0;
    const exponentialWithJitter = Math.min(exponential + jitterMs, opts.maxDelayMs);
    const retryAfterMs = retryAfterUsedMs ?? 0;
    const waitMs = Math.max(exponentialWithJitter, retryAfterMs);

    prevWaitMs = waitMs;

    // 总耗时上限再次检查（睡眠期间可能已经超）
    if (performance.now() - start + waitMs >= opts.maxTotalTimeMs) {
      throw new Error(
        `maxTotalTime would be exceeded by next wait (${(performance.now() - start).toFixed(0)}ms + ${waitMs.toFixed(0)}ms / ${opts.maxTotalTimeMs}ms)`,
      );
    }

    await sleep(waitMs);
  }

  // 走到这里说明所有 attempt 都失败且没抛 NonRetryableError → 重试耗尽
  throw new RetryExhaustedError(attempts);
}
