/**
 * 职责：把 retryWithBackoff 套在「本机 mock fetch」或「真 OpenAI 调用」外面，收成统一的 { ok, attempts }。
 * 数据流：target / prompt → retryWithBackoff(fn) → ProxyResult | RealResult | BurstResult。
 * 为什么这些小函数放同一文件：都是「分类错误 → 填 attempts 时间线」，拆开会把 errToResult 抄两遍。
 */
import { performance } from "node:perf_hooks";
import { llm, PORT } from "../http/runtime-ctx.js";
import { resetEasyFailures } from "../mock/mock-responses.js";
import {
  retryWithBackoff,
  NonRetryableError,
  RetryExhaustedError,
  DEFAULT_RETRY_OPTIONS,
  type AttemptRecord,
} from "../retry/retry.js";

export type RetryErrorType = "NonRetryableError" | "RetryExhaustedError" | "Error" | "NoKey";

export type ProxyOk = {
  ok: true;
  target: string;
  result: string;
  attempts: AttemptRecord[];
};
export type ProxyFail = {
  ok: false;
  target: string;
  error: string;
  errorType: RetryErrorType;
  attempts: AttemptRecord[];
};
export type ProxyResult = ProxyOk | ProxyFail;

export type RealOk = {
  ok: true;
  hasKey: true;
  result: string;
  attempts: AttemptRecord[];
};
export type RealFail = {
  ok: false;
  hasKey: boolean;
  error: string;
  errorType: RetryErrorType;
  attempts: AttemptRecord[];
};
export type RealResult = RealOk | RealFail;

export type BurstOneResult = {
  idx: number;
  ok: boolean;
  attempts: AttemptRecord[];
  result?: string;
  error?: string;
  errorType?: string;
  totalTimeMs: number;
};

export type BurstResult = {
  ok: boolean;
  hasKey: boolean;
  concurrency: number;
  aggregate: {
    total: number;
    okFirstTry: number;
    okAfterRetry: number;
    failed: number;
    totalRetries: number;
    total429: number;
    total5xx: number;
    totalNetwork: number;
    totalTimeMs: number;
  };
  results: BurstOneResult[];
};

/** 把 retry 抛出的两类错（外加普通 Error）收成页面能渲染的形状。 */
export function errToResult(err: unknown): {
  ok: false;
  error: string;
  errorType: RetryErrorType;
  attempts: AttemptRecord[];
} {
  const attempts =
    err instanceof RetryExhaustedError
      ? err.attempts
      : err instanceof NonRetryableError
        ? [
            {
              attempt: 1,
              status: err.status,
              waitBeforeMs: 0,
              retryAfterUsedMs: null,
              durationMs: 0,
              errorMessage: err.body.slice(0, 80),
            },
          ]
        : [];
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    errorType:
      err instanceof NonRetryableError
        ? "NonRetryableError"
        : err instanceof RetryExhaustedError
          ? "RetryExhaustedError"
          : "Error",
    attempts,
  };
}

/**
 * /api/proxy：用 retryWithBackoff 包一层后转发到本机直接路径。
 * ① easy 每次重置计数器，保证「前 2 次 429、第 3 次 200」可重复演示；
 * ② fn 里 fetch 本机 /api/{target}，retry 才能看见真 HTTP 状态码和 Retry-After；
 * ③ 业务失败返回 HTTP 200 + ok:false —— attempts 才是教学数据，用 4xx 会把时间线吞掉。
 */
export async function handleProxy(target: string): Promise<{ status: number; body: ProxyResult }> {
  if (target === "easy") resetEasyFailures();
  const url = `http://127.0.0.1:${PORT}/api/${target}`;
  try {
    const { result, attempts } = await retryWithBackoff(
      async (_signal) => {
        const resp = await fetch(url);
        const body = await resp.text();
        return { status: resp.status, body, headers: resp.headers };
      },
      { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 4 },
    );
    return { status: 200, body: { ok: true, target, result, attempts } };
  } catch (err) {
    return { status: 200, body: { target, ...errToResult(err) } };
  }
}

/**
 * 把 OpenAI SDK 的异常包成 {status, body, headers}，让 retryWithBackoff 走统一分类。
 * ① 2xx → 把 content 当 body 交给 retry 当成功；
 * ② 带 status 的 APIError → 转成对应 status，retry 决定要不要重试；
 * ③ 没 status（网络 / AbortError）→ 原样 throw，retry 记 status=network。
 */
export async function callOpenAI(
  prompt: string,
  signal: AbortSignal,
): Promise<{ status: number; body: string; headers: Headers }> {
  const realClient = llm?.openai ?? null;
  if (!realClient || !llm) {
    return { status: 500, body: "no real client", headers: new Headers() };
  }
  try {
    const resp = await realClient.chat.completions.create(
      {
        model: llm.modelA,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
      },
      { signal },
    );
    const content = resp.choices[0]?.message?.content ?? "";
    return { status: 200, body: content, headers: new Headers() };
  } catch (err) {
    const apiErr = err as {
      status?: number;
      headers?: Record<string, string>;
      message?: string;
      error?: { message?: string; type?: string; code?: string };
    };
    if (typeof apiErr.status === "number") {
      const headers = new Headers(apiErr.headers ?? {});
      const body = apiErr.error?.message ?? apiErr.message ?? String(err);
      return { status: apiErr.status, body, headers };
    }
    throw err;
  }
}

/** 单次真请求，套 retry；看真网络延迟 / 真错误结构。 */
export async function handleReal(): Promise<RealResult> {
  if (!llm?.openai) {
    return {
      ok: false,
      hasKey: false,
      error: "apps/.env 当前 LLM_PROVIDER 没有 Key，跳过 /api/real",
      errorType: "NoKey",
      attempts: [],
    };
  }
  try {
    const { result, attempts } = await retryWithBackoff(
      (signal) => callOpenAI("用 50 字以内介绍一下你自己", signal),
      { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, maxTotalTimeMs: 30_000 },
    );
    return { ok: true, hasKey: true, result, attempts };
  } catch (err) {
    return { hasKey: true, ...errToResult(err) };
  }
}

/** 并发 N 个真请求，每个独立套 retry；统计成功 / 失败 / 状态码分布。 */
export async function handleRealBurst(concurrency: number): Promise<BurstResult> {
  if (!llm?.openai) {
    return {
      ok: false,
      hasKey: false,
      concurrency,
      aggregate: {
        total: 0,
        okFirstTry: 0,
        okAfterRetry: 0,
        failed: 0,
        totalRetries: 0,
        total429: 0,
        total5xx: 0,
        totalNetwork: 0,
        totalTimeMs: 0,
      },
      results: [],
    };
  }
  const tasks = Array.from({ length: concurrency }, (_, i) => {
    const start = performance.now();
    return retryWithBackoff(
      (signal) => callOpenAI(`req#${i}: 简短回答"ok"两个字`, signal),
      { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, maxTotalTimeMs: 30_000 },
    ).then(
      (r) => ({
        idx: i,
        ok: true as const,
        attempts: r.attempts,
        result: r.result,
        totalTimeMs: performance.now() - start,
      }),
      (err: unknown) => ({
        idx: i,
        ...errToResult(err),
        totalTimeMs: performance.now() - start,
      }),
    );
  });
  const results = await Promise.all(tasks);
  const allAttempts = results.flatMap((r) => r.attempts);
  const aggregate = {
    total: results.length,
    okFirstTry: results.filter((r) => r.ok && r.attempts.length === 1).length,
    okAfterRetry: results.filter((r) => r.ok && r.attempts.length > 1).length,
    failed: results.filter((r) => !r.ok).length,
    totalRetries: allAttempts.length - results.length,
    total429: allAttempts.filter((a) => a.status === 429).length,
    total5xx: allAttempts.filter(
      (a) => typeof a.status === "number" && a.status >= 500 && a.status < 600,
    ).length,
    totalNetwork: allAttempts.filter((a) => a.status === "network").length,
    totalTimeMs: Math.max(...results.map((r) => r.totalTimeMs)),
  };
  return { ok: true, hasKey: true, concurrency, aggregate, results };
}
