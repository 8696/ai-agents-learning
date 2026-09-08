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
 * 日志（§5.3.16）：retry 是本条的核心档——函数体逐步打满（start / 每次循环 start / decide / non-retryable / network-error / success / exhausted），每个教学分支都打满便于回讲。
 */

import { performance } from "node:perf_hooks";
import { logger } from "../logger.js";

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
export type RequestFn = (signal: AbortSignal, attempt: number) => Promise<{
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
  const tFuncStart = Date.now();
  const attempts: AttemptRecord[] = [];
  let prevWaitMs = 0; // 上一轮算出来的实际等待；attempt 1 = 0

  logger.info(
    "│ retry-retryWithBackoff",
    "调用函数开始：retryWithBackoff",
    "为什么打：本 Demo 唯一的 retry 入口；外层一次完整重试循环开始。记 maxAttempts / 上限便于事后核对为什么到 N 次就停。当前：即将进入 for 循环。",
    {
      入参: {
        maxAttempts: opts.maxAttempts,
        baseDelayMs: opts.baseDelayMs,
        maxDelayMs: opts.maxDelayMs,
        maxTotalTimeMs: opts.maxTotalTimeMs,
        jitter: opts.jitter,
      },
      __code: `const attempts: AttemptRecord[] = [];\nfor (let i = 0; i < opts.maxAttempts; i++) { ... }`,
    },
  );

  for (let i = 0; i < opts.maxAttempts; i++) {
    const attemptNo = i + 1;

    // 总耗时上限：开始下一次 attempt 之前先看
    const elapsed = performance.now() - start;
    if (elapsed >= opts.maxTotalTimeMs) {
      logger.warn(
        "││ retry-循环",
        `总耗时上限已达，不再开始第 ${attemptNo} 轮 attempt`,
        "为什么打：maxTotalTimeMs 用来防双卡——这里提前抛 Error 让上层立刻收 attempts 不再 sleep。warn 是「业务失败但能走通」的等级。",
        {
          第几轮: attemptNo,
          elapsedMs: Math.round(elapsed),
          budgetMs: opts.maxTotalTimeMs,
          attemptsSoFar: attempts.length,
        },
      );
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

    logger.info(
      "││ retry-循环",
      `调用循环开始：第 ${attemptNo} 轮 / 共 ${opts.maxAttempts} 轮`,
      "为什么打：retry 是 for 循环，每一轮打满便于核对 attempts 时间线。当前：即将发请求。",
      {
        第几轮: attemptNo,
        本轮为什么是这些参数: {
          waitBeforeMs: prevWaitMs,
          reason: "waitBeforeMs 由上一轮 retry.decide 算出；attempt 1 = 0",
        },
      },
    );

    try {
      // 给每次 attempt 单独建一个 controller；本轮结束（包括决定 retry）
      // 之后立即 abort 掉，避免底层 socket 残留。
      const controller = new AbortController();
      const resp = await fn(controller.signal, attemptNo);
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
        logger.warn(
          "││ retry-循环",
          `attempt ${attemptNo} 命中不可重试状态码 → 直接抛`,
          "为什么打：NON_RETRYABLE_STATUS（400/401/403/404/422）重试只会得到同样的错，所以立刻停手——记录 status 与 body 摘要便于核对此处为何提前终止。",
          {
            第几轮: attemptNo,
            status: resp.status,
            bodyPreview: resp.body.slice(0, 200),
            retryAfterHeader: retryAfterHeader ?? null,
            durationMs: Math.round(performance.now() - attemptStart),
            attemptsSoFar: attempts.length,
          },
        );
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
      logger.warn(
        "││ retry-循环",
        `attempt ${attemptNo} 网络层抛错 → 视作可重试`,
        "为什么打：fetch / SDK 抛 AbortError / ECONNRESET 等没有 status；落 status=network 让前端时间线统一渲染。",
        {
          第几轮: attemptNo,
          err: errorMessage,
          durationMs: Math.round(performance.now() - attemptStart),
        },
      );
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
      logger.info(
        "││ retry-循环",
        `调用循环结束：第 ${attemptNo} 轮（成功）`,
        "为什么打：本轮拿到 2xx 响应，整 attempts 时间线交还上层；记 status + duration 便于事后算 retry 总耗时。",
        {
          第几轮: attemptNo,
          本轮结果: { status, bodyPreview: successBody.slice(0, 80) },
          耗时ms: Math.round(performance.now() - attemptStart),
        },
      );
      logger.info(
        "│ retry-retryWithBackoff",
        "调用函数结束：retryWithBackoff（成功）",
        "为什么打：把整 attempts 时间线交还上层；打返回便于核对「这次一共跑了 N 轮、最后一次拿到了 2xx」。当前：第 N 轮成功。",
        {
          返回值: {
            attemptsTotal: attempts.length,
            totalElapsedMs: Math.round(performance.now() - start),
            lastStatus: attempts.at(-1)?.status,
          },
          耗时ms: Date.now() - tFuncStart,
        },
      );
      return { result: successBody, attempts };
    }

    // 最后一次不需要 sleep（马上跳出循环）
    if (i === opts.maxAttempts - 1) {
      logger.warn(
        "││ retry-循环",
        `调用循环结束：第 ${attemptNo} 轮（最后一把失败）`,
        "为什么打：maxAttempts 含首次——最后一次失败后不再 sleep 直接抛 RetryExhaustedError；attempts 已含全部时间线。",
        {
          第几轮: attemptNo,
          lastStatus: status,
          maxAttempts: opts.maxAttempts,
        },
      );
      logger.warn(
        "│ retry-retryWithBackoff",
        "调用函数结束：retryWithBackoff（重试耗尽）",
        "为什么打：本 Demo 最大的教学点——maxAttempts 把每次都打满仍失败时抛 RetryExhaustedError 让上层收 attempts 时间线。当前：所有 attempt 都失败。",
        {
          返回值: { attemptsTotal: attempts.length, lastStatus: status },
          耗时ms: Date.now() - tFuncStart,
        },
      );
      break;
    }

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

    logger.info(
      "││ retry-循环",
      `attempt ${attemptNo} 失败 → 决定 sleep ${Math.round(waitMs)}ms 后重试（第 ${attemptNo + 1} 轮）`,
      "为什么打：本节点是 rate limit / 5xx 教学的关键：算下次等待 = max(exponential+jitter, Retry-After)，记下来便于讲清「服务端给的不能抖、自己算的可以抖」。",
      {
        第几轮: attemptNo,
        thisStatus: status,
        thisErrorMessage: errorMessage ?? null,
        retryAfterUsedMs,
        retryAfterParsedMs: retryAfterMs,
        exponentialMs: Math.round(exponential),
        jitterMs: Math.round(jitterMs),
        exponentialWithJitterMs: Math.round(exponentialWithJitter),
        waitMs: Math.round(waitMs),
        nextAttemptNo: attemptNo + 1,
        attemptsSoFar: attempts.length,
        __code: `const exponential = Math.min(base * 2 ** i, maxDelay);\nconst jitter = baseRandom;\nconst wait = Math.max(exponential + jitter, retryAfter);`,
      },
    );

    prevWaitMs = waitMs;

    // 总耗时上限再次检查（睡眠期间可能已经超）
    if (performance.now() - start + waitMs >= opts.maxTotalTimeMs) {
      logger.warn(
        "││ retry-循环",
        "下一次 sleep 会撞总耗时 → 提前抛 Error",
        "为什么打：如果硬 sleep 会让总耗时超 maxTotalTimeMs；这里提前抛避免浪费一次 sleep 周期。",
        {
          第几轮: attemptNo,
          elapsedMs: Math.round(performance.now() - start),
          nextWaitMs: Math.round(waitMs),
          budgetMs: opts.maxTotalTimeMs,
          attemptsSoFar: attempts.length,
        },
      );
      throw new Error(
        `maxTotalTime would be exceeded by next wait (${(performance.now() - start).toFixed(0)}ms + ${waitMs.toFixed(0)}ms / ${opts.maxTotalTimeMs}ms)`,
      );
    }

    await sleep(waitMs);
  }

  // 走到这里说明所有 attempt 都失败且没抛 NonRetryableError → 重试耗尽
  throw new RetryExhaustedError(attempts);
}