/**
 * 职责：把 retryWithBackoff 套在「本机 mock fetch」或「真 OpenAI 调用」外面，收成统一的 { ok, attempts }。
 * 数据流：target / prompt → retryWithBackoff(fn) → ProxyResult | RealResult | BurstResult。
 * 为什么这些小函数放同一文件：都是「分类错误 → 填 attempts 时间线」，拆开会把 errToResult 抄两遍。
 *
 * 日志（§5.3.16）：每个 LLM 调用前后打 llm.request.{attempt} / llm.response.{attempt}；
 *   429 / 5xx 由 retry 层 retry.decide 记；burst 在外层补一个并发启动总览。
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
import { logger } from "../logger.js";

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
  logger.info("proxy.start", `/api/proxy target=${target}`, "本机 fetch 走本进程 mock 端点；记 target + url 便于把日志和 mock-responses.ts 对照", {
        target,
        url,
        maxAttempts: 4,
      });
  try {
    const { result, attempts } = await retryWithBackoff(
      async (signal, attempt) => {
        logger.info(`proxy.fetch.${attempt}`, `→ fetch ${url}`, "外层 retry 的 fn 实际只做一次 HTTP GET；记 attempt 便于和 retry.decide 时间线对齐", {
          attempt,
          url,
          method: "GET",
          __code: `const resp = await fetch(${JSON.stringify(url)});`,
        });
        const resp = await fetch(url);
        const body = await resp.text();
        return { status: resp.status, body, headers: resp.headers };
      },
      { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 4 },
    );
    logger.info("proxy.ok", `/api/proxy target=${target} 成功`, "本机 mock 路径成功；attempts 长度说明这次重试了几次", {
      target,
      attemptsTotal: attempts.length,
      lastStatus: attempts.at(-1)?.status,
    });
    return { status: 200, body: { ok: true, target, result, attempts } };
  } catch (err) {
    logger.warn("proxy.fail", `/api/proxy target=${target} 失败`, "mock 路径也按真实接口语义区分 RetryExhaustedError / NonRetryableError / Error；attempts 已含", {
      target,
      err: err instanceof Error ? err.message : String(err),
      errType: err instanceof RetryExhaustedError
        ? "RetryExhaustedError"
        : err instanceof NonRetryableError
          ? "NonRetryableError"
          : "Error",
    });
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
  attempt: number,
): Promise<{ status: number; body: string; headers: Headers }> {
  const realClient = llm?.openai ?? null;
  if (!realClient || !llm) {
    logger.warn("llm.no-client", "realClient 为空", "上层 requireLlm 已经挡住了，但这里再兜一道；返回 500 让 retry 走可重试路径（按现状不变）", { attempt });
    return { status: 500, body: "no real client", headers: new Headers() };
  }

  const requestBody = {
    model: llm.modelA,
    messages: [{ role: "user" as const, content: prompt }],
    max_tokens: 120,
  };

  logger.info(`llm.request.${attempt}`, `→ openai.chat.completions.create (attempt ${attempt})`, "本 demo 唯一的真 LLM 调用入口；记 attempt / model / promptLen / __code 便于核对协议 A 请求结构", {
    attempt,
    provider: llm.provider,
    model: requestBody.model,
    messagesCount: requestBody.messages.length,
    promptPreview: prompt.slice(0, 80),
    promptLen: prompt.length,
    __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestBody, null, 2)});`,
  });

  try {
    const resp = await realClient.chat.completions.create(requestBody, { signal });
    const content = resp.choices[0]?.message?.content ?? "";
    logger.info(`llm.response.${attempt}`, "← got response", "完整打响应便于核对 SDK 自带字段（id / model / choices / usage）；attempt 落在 scope 上便于串 retry 时间线", resp);
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
      // 429 是 demo 的核心教学点：单独打一条 llm.429 便于直接 grep
      if (apiErr.status === 429) {
        const retryAfterHeader = headers.get("retry-after") ?? headers.get("Retry-After");
        logger.warn("llm.429", `attempt ${attempt} 命中 429 Rate Limit`, "OpenAI SDK 把 429 包成 APIError.status；按 NON_RETRYABLE_STATUS 不在白名单 → retry 层走可重试；记 status / message / Retry-After 便于讲清「服务端拒绝 + 何时回退」", {
          attempt,
          status: 429,
          type: apiErr.error?.type ?? null,
          code: apiErr.error?.code ?? null,
          message: body.slice(0, 200),
          retryAfterHeader,
          headersKeys: Array.from(headers.keys()),
        });
      } else if (apiErr.status >= 500) {
        logger.warn("llm.5xx", `attempt ${attempt} 命中 5xx`, "上游 5xx 也是可重试；记 status 便于讲清「5xx 重试比 429 更激进」", {
          attempt,
          status: apiErr.status,
          message: body.slice(0, 200),
          retryAfterHeader: headers.get("retry-after") ?? null,
        });
      } else if (apiErr.status >= 400) {
        logger.warn("llm.4xx", `attempt ${attempt} 命中 4xx 不可重试`, "NON_RETRYABLE_STATUS 含 400/401/403/404/422——retry 层会立刻抛 NonRetryableError 停手；记 status 便于事后讲「为什么这次没重试」", {
          attempt,
          status: apiErr.status,
          message: body.slice(0, 200),
        });
      }
      return { status: apiErr.status, body, headers };
    }
    logger.warn(`llm.network-error.${attempt}`, "OpenAI SDK 抛异常且无 status", "无 status 视为可重试；retry 层会落 status=network；记 message 便于排错", {
      attempt,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** 单次真请求，套 retry；看真网络延迟 / 真错误结构。 */
export async function handleReal(): Promise<RealResult> {
  if (!llm?.openai) {
    logger.warn("real.no-key", "跳过 /api/real：无 Key", "apps/.env 当前 provider 没 Key；这是正常业务跳过而非异常", {});
    return {
      ok: false,
      hasKey: false,
      error: "apps/.env 当前 LLM_PROVIDER 没有 Key，跳过 /api/real",
      errorType: "NoKey",
      attempts: [],
    };
  }
  logger.info("real.start", "handleReal 启动", "真请求单发；记 provider + 模型便于和 mock 对照", {
    provider: llm.provider,
    modelA: llm.modelA,
    maxAttempts: 3,
    maxTotalTimeMs: 30_000,
  });
  try {
    const { result, attempts } = await retryWithBackoff(
      (signal, attempt) => callOpenAI("用 50 字以内介绍一下你自己", signal, attempt),
      { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, maxTotalTimeMs: 30_000 },
    );
    logger.info("real.ok", "handleReal 成功", "真请求成功；记 attemptsTotal + result 摘要", {
      attemptsTotal: attempts.length,
      resultPreview: result.slice(0, 80),
      resultLen: result.length,
    });
    return { ok: true, hasKey: true, result, attempts };
  } catch (err) {
    logger.warn("real.fail", "handleReal 失败", "真请求重试耗尽 / 不可重试；attempts 已含整条时间线", {
      err: err instanceof Error ? err.message : String(err),
      errType: err instanceof RetryExhaustedError
        ? "RetryExhaustedError"
        : err instanceof NonRetryableError
          ? "NonRetryableError"
          : "Error",
    });
    return { hasKey: true, ...errToResult(err) };
  }
}

/** 并发 N 个真请求，每个独立套 retry；统计成功 / 失败 / 状态码分布。 */
export async function handleRealBurst(concurrency: number): Promise<BurstResult> {
  if (!llm?.openai) {
    logger.warn("real-burst.no-key", "跳过 /api/real-burst：无 Key", "无 Key 时并发没必要跑；返回空 aggregate", { concurrency });
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
  logger.info("real-burst.start", `并发 ${concurrency} 个真请求`, "每个任务独立 retry；记 concurrency + 总上限便于讲清 burst 教学", {
    concurrency,
    provider: llm.provider,
    modelA: llm.modelA,
    maxAttempts: 3,
    maxTotalTimeMs: 30_000,
  });
  const tasks = Array.from({ length: concurrency }, (_, i) => {
    const start = performance.now();
    logger.debug("real-burst.task", `启动 task #${i}`, "每个 task 自己一套 retryWithBackoff；记 idx + 起始时间便于事后核对其生命周期", { idx: i });
    return retryWithBackoff(
      (signal, attempt) => callOpenAI(`req#${i}: 简短回答"ok"两个字`, signal, attempt),
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
  logger.info("real-burst.done", `并发 ${concurrency} 收尾`, "记录最终 aggregate 分布便于直接对照页面 / 笔记", {
    concurrency,
    aggregate,
  });
  return { ok: true, hasKey: true, concurrency, aggregate, results };
}
