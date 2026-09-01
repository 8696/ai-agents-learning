/**
 * 模块 02 · 04 Rate-Limit · Demo 入口
 *
 * 职责：
 *   1. 启动本地 HTTP mock server（5 个端点 × 2 套：直接路径 + 走 retry 的 proxy）
 *   2. CLI 模式：依次跑 6 个 mock 场景 + 1 个真 API 单次场景，console 打印时间线
 *   3. 浏览器模式：访问 http://127.0.0.1:5176/，点按钮跑同样场景，时间线渲染到页面
 *   4. 真 API：/api/real 单次 + /api/real-burst 并发撞 429（需 apps/.env 里有 Key）
 *
 * 端点（mock LLM 行为，零成本）：
 *   GET /api/easy       — 前 2 次返回 429 + Retry-After: 0.5，第 3 次 200 OK
 *                          → 看：指数退避 + 听 Retry-After + 最终成功
 *   GET /api/chaos      — 每次请求随机返回 429/500/200（带 Retry-After 变化）
 *                          → 看：连跑 6 次 → jitter 让每次的等待时长不一样
 *   GET /api/auth       — 永远 401
 *                          → 看：NonRetryableError，首次失败立刻抛
 *   GET /api/forever    — 永远 429 + Retry-After: 0.3
 *                          → 看：maxAttempts 上限 + RetryExhaustedError
 *   GET /api/ok         — 永远 200 OK
 *                          → 看：成功路径不触发重试
 *
 *   GET /api/proxy?target=easy|chaos|auth|forever|ok
 *                        — 套上 retryWithBackoff 后转发到上面 5 个端点
 *
 * 端点（真 API，需 apps/.env 里有 MINIMAX_API_KEY）：
 *   GET /api/real                      — 单次真请求，套 retry（看真网络延迟 / 真错误结构）
 *   GET /api/real-burst?concurrency=20 — 并发 N 个真请求，每个套 retry
 *                                        → 看真 429 真 Retry-After 头；每次跑会烧 token
 *
 * 为什么 mock + 真 API 两套：
 *   - mock：教学主战场，确定性、零成本、不依赖 Key；讲清分类 / 退避 / jitter / 上限
 *   - 真 API：证明 retry 在真环境也工作 + 看到真 429 真 Retry-After；按需开启 burst 撞限
 *
 * 数据流：
 *   CLI：fetch('http://127.0.0.1:5176/api/proxy?target=…')
 *        → mock server 内部调用 retryWithBackoff → 拿到 { result, attempts }
 *        → console 打印时间线表
 *   浏览器：fetch('/api/proxy?target=…') 或 '/api/real' 或 '/api/real-burst?…' → 同上
 *
 * 概念 / 取舍 / 踩坑：docs/学习模块/02-LLM-API开发/04-Rate-Limit.md
 */

import { createServer, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "../../load-root-env.js";
import {
  retryWithBackoff,
  NonRetryableError,
  RetryExhaustedError,
  DEFAULT_RETRY_OPTIONS,
  type AttemptRecord,
} from "./retry.js";

loadRootEnv(); // mock 端点不依赖 env；real 端点需要 env 里有 Key
const PORT = Number(process.env.PORT) || 5176;

// ── env 校验（real 端点用） ────────────────────────────────────
const envSchema = z.object({
  MINIMAX_API_KEY: z.string().min(1).optional(),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
});
const env = envSchema.parse(process.env);
const hasRealKey = !!env.MINIMAX_API_KEY;
const realClient = hasRealKey
  ? new OpenAI({ apiKey: env.MINIMAX_API_KEY!, baseURL: env.MINIMAX_BASE_URL })
  : null;

// ── 1) mock server 的端点状态机 ────────────────────────────────
/** /api/easy 的"还差几次就 200"计数器（per-process；刷新页面 / 重跑会重置） */
const easyRemainingFailures = { count: 2 };
/** /api/chaos 的简单随机：30% 429 / 20% 500 / 50% 200 */
function chaosRoll(): { status: number; retryAfter?: string } {
  const r = Math.random();
  if (r < 0.3) return { status: 429, retryAfter: "0.3" };
  if (r < 0.5) return { status: 500 };
  return { status: 200 };
}

/** 直接路径（不走 retry）：返回 mock LLM 行为，让 retry 套在外面 */
function handleDirect(path: string): { status: number; headers: Record<string, string>; body: string } {
  switch (path) {
    case "/api/easy": {
      if (easyRemainingFailures.count > 0) {
        easyRemainingFailures.count -= 1;
        return {
          status: 429,
          headers: { "retry-after": "0.5", "content-type": "application/json" },
          body: JSON.stringify({ error: "rate_limit_exceeded", message: "请 0.5 秒后再试（mock）" }),
        };
      }
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "chatcmpl-easy", content: "你好，我是 mock LLM（easy）", usage: { prompt_tokens: 10, completion_tokens: 8 } }),
      };
    }
    case "/api/chaos": {
      const roll = chaosRoll();
      if (roll.status === 200) {
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "chatcmpl-chaos-ok", content: "ok（mock）", usage: { prompt_tokens: 5, completion_tokens: 3 } }),
        };
      }
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (roll.retryAfter) headers["retry-after"] = roll.retryAfter;
      return {
        status: roll.status,
        headers,
        body: JSON.stringify({ error: roll.status === 429 ? "rate_limit_exceeded" : "internal_error", message: `mock ${roll.status}` }),
      };
    }
    case "/api/auth":
      return {
        status: 401,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "invalid_api_key", message: "Incorrect API key provided" }),
      };
    case "/api/forever":
      return {
        status: 429,
        headers: { "retry-after": "0.3", "content-type": "application/json" },
        body: JSON.stringify({ error: "rate_limit_exceeded", message: "永久 429（mock）" }),
      };
    case "/api/ok":
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "chatcmpl-ok", content: "直接成功（mock）", usage: { prompt_tokens: 5, completion_tokens: 3 } }),
      };
    default:
      return { status: 404, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "not_found" }) };
  }
}

/** 把 Node IncomingMessage 的 headers 转成 Web Headers（retry 用） */
function nodeHeadersToWeb(headers: IncomingMessage["headers"]): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) {
    if (v == null) continue;
    h.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }
  return h;
}

/** 一次性把 HTML 读进内存（小 demo，没必要走流式 fs） */
const html = readFileSync(
  fileURLToPath(new URL("./public/index.html", import.meta.url)),
  "utf-8",
);

/** /api/proxy：用 retryWithBackoff 包一层后转发到直接路径 */
async function handleProxy(target: string): Promise<{
  status: number;
  body: { ok: true; target: string; result: string; attempts: AttemptRecord[] }
        | { ok: false; target: string; error: string; errorType: string; attempts: AttemptRecord[] };
}> {
  const url = `http://127.0.0.1:${PORT}/api/${target}`;
  try {
    const { result, attempts } = await retryWithBackoff(
      async (_signal) => {
        const resp = await fetch(url);
        const body = await resp.text();
        return { status: resp.status, body, headers: resp.headers };
      },
      { ...DEFAULT_RETRY_OPTIONS, maxAttempts: target === "ok" || target === "auth" ? 4 : 4 },
    );
    return {
      status: 200,
      body: { ok: true, target, result, attempts },
    };
  } catch (err) {
    const attempts =
      err instanceof RetryExhaustedError ? err.attempts :
      err instanceof NonRetryableError ? [{
        attempt: 1, status: err.status, waitBeforeMs: 0, retryAfterUsedMs: null,
        durationMs: 0, errorMessage: err.body.slice(0, 80),
      }] : [];
    return {
      status: 200, // 业务层错误用 200 + ok:false 表达；HTTP 语义已经反映在 attempts 里
      body: {
        ok: false,
        target,
        error: err instanceof Error ? err.message : String(err),
        errorType: err instanceof NonRetryableError ? "NonRetryableError"
                 : err instanceof RetryExhaustedError ? "RetryExhaustedError"
                 : "Error",
        attempts,
      },
    };
  }
}

// ── 1.5) 真 API 端点（需 apps/.env 里有 MINIMAX_API_KEY） ──────

/** 把 OpenAI SDK 的异常包成 {status, body, headers}，让 retryWithBackoff 走统一分类
 *  - 2xx → 直接返回成功（带 content）
 *  - 4xx/5xx → 返回对应 status + message，retry 层决定要不要重试
 *  - 网络错 / AbortError → 抛出去，retry 层视为 network 错重试
 */
async function callOpenAI(
  prompt: string,
  signal: AbortSignal,
): Promise<{ status: number; body: string; headers: Headers }> {
  if (!realClient) {
    // 不可能走到这里（被外层 hasRealKey 拦住了）；兜底
    return { status: 500, body: "no real client", headers: new Headers() };
  }
  try {
    const resp = await realClient.chat.completions.create(
      {
        model: env.MINIMAX_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
      },
      { signal },
    );
    const content = resp.choices[0]?.message?.content ?? "";
    return { status: 200, body: content, headers: new Headers() };
  } catch (err) {
    // OpenAI SDK 抛 APIError（含 status + headers），或抛普通 Error（网络 / abort）
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
    // 没有 status → 视为网络错（让 retry 层重试）
    throw err;
  }
}

/** 把上层异常包成 { ok:false, attempts, errorType } 统一结构 */
function errToResult(
  err: unknown,
): { ok: false; error: string; errorType: string; attempts: AttemptRecord[] } {
  const attempts =
    err instanceof RetryExhaustedError ? err.attempts :
    err instanceof NonRetryableError ? [{
      attempt: 1, status: err.status, waitBeforeMs: 0, retryAfterUsedMs: null,
      durationMs: 0, errorMessage: err.body.slice(0, 80),
    }] : [];
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    errorType: err instanceof NonRetryableError ? "NonRetryableError"
             : err instanceof RetryExhaustedError ? "RetryExhaustedError"
             : "Error",
    attempts,
  };
}

/** 单次真请求，套 retry；看真网络延迟 / 真错误结构 */
async function handleReal(): Promise<{
  ok: boolean;
  hasKey: boolean;
  result?: string;
  error?: string;
  errorType?: string;
  attempts: AttemptRecord[];
}> {
  if (!realClient) {
    return {
      ok: false, hasKey: false,
      error: "apps/.env 里没有 MINIMAX_API_KEY，跳过 /api/real",
      errorType: "NoKey", attempts: [],
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

/** 并发 N 个真请求，每个独立套 retry；统计成功 / 失败 / 状态码分布 */
async function handleRealBurst(concurrency: number): Promise<{
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
  results: Array<{
    idx: number;
    ok: boolean;
    attempts: AttemptRecord[];
    result?: string;
    error?: string;
    errorType?: string;
    totalTimeMs: number;
  }>;
}> {
  if (!realClient) {
    return {
      ok: false, hasKey: false, concurrency, aggregate: {
        total: 0, okFirstTry: 0, okAfterRetry: 0, failed: 0,
        totalRetries: 0, total429: 0, total5xx: 0, totalNetwork: 0, totalTimeMs: 0,
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
        idx: i, ok: true as const,
        attempts: r.attempts, result: r.result,
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
    total5xx: allAttempts.filter((a) => typeof a.status === "number" && a.status >= 500 && a.status < 600).length,
    totalNetwork: allAttempts.filter((a) => a.status === "network").length,
    totalTimeMs: Math.max(...results.map((r) => r.totalTimeMs)),
  };
  return { ok: true, hasKey: true, concurrency, aggregate, results };
}

// ── 2) HTTP server 路由 ──────────────────────────────────────────
const server = createServer(async (req, res) => {
  // CORS（浏览器 fetch 需要）
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  // 浏览器入口
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // 走 retry 的 proxy
  if (url.pathname === "/api/proxy") {
    const target = url.searchParams.get("target") ?? "";
    if (!target) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing target" }));
      return;
    }
    const out = await handleProxy(target);
    res.writeHead(out.status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(out.body));
    return;
  }

  // 真 API：单次（拿不到 key 直接 200 + ok:false，不让浏览器控制台炸）
  if (url.pathname === "/api/real") {
    const out = await handleReal();
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(out));
    return;
  }

  // 真 API：并发撞 429
  if (url.pathname === "/api/real-burst") {
    const conc = Math.min(50, Math.max(1, Number(url.searchParams.get("concurrency") ?? 20)));
    const out = await handleRealBurst(conc);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(out));
    return;
  }

  // 直接路径（不走 retry）
  if (url.pathname.startsWith("/api/")) {
    const target = url.pathname.slice("/api/".length);
    const direct = handleDirect(url.pathname);
    res.writeHead(direct.status, { ...direct.headers, "Access-Control-Allow-Origin": "*" });
    res.end(direct.body);
    // 抑制 unused 警告
    void target;
    void nodeHeadersToWeb;
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

// ── 3) CLI 模式：依次跑 6 个场景，打印时间线 ──────────────────
async function runCliScenarios() {
  const scenarios: { name: string; target: string; expect: string }[] = [
    { name: "① /api/easy     （前 2 次 429 + Retry-After → 第 3 次 200）", target: "easy", expect: "成功" },
    { name: "② /api/chaos    （随机 429/500/200，连跑 6 次看 jitter 分布）", target: "chaos", expect: "看分布" },
    { name: "③ /api/auth     （永远 401）", target: "auth", expect: "NonRetryableError（首次失败立刻抛）" },
    { name: "④ /api/forever  （永远 429）", target: "forever", expect: "RetryExhaustedError（重试耗尽）" },
    { name: "⑤ /api/ok       （直接 200）", target: "ok", expect: "成功（首次就过）" },
  ];

  console.log("\n┌─ Retry Demo · CLI 时间线 ──────────────────────────────────┐");
  for (const sc of scenarios) {
    // chaos 跑 6 次：看 jitter 让每次的等待时长不一样
    const runs = sc.target === "chaos" ? 6 : 1;
    for (let r = 0; r < runs; r++) {
      const label = runs > 1 ? `${sc.name}  [run ${r + 1}/${runs}]` : sc.name;
      console.log(`\n▶ ${label}`);
      console.log(`  预期：${sc.expect}`);
      const out = await handleProxy(sc.target);
      if (out.body.ok) {
        const { result, attempts } = out.body;
        printTimeline(attempts);
        console.log(`  ✅ 最终成功：${truncate(result, 60)}`);
      } else {
        const { errorType, error, attempts } = out.body;
        printTimeline(attempts);
        console.log(`  ❌ ${errorType}：${truncate(error, 60)}`);
      }
    }
  }

  // ⑥ 真 API：单次（默认跑，~0.001 元）
  console.log(`\n▶ ⑥ /api/real     （真调 ${env.MINIMAX_MODEL}，套 retry；看真网络延迟 / 真错误结构）`);
  console.log(`  预期：大多数情况直接 200；偶发网络抖动 → retry`);
  if (!realClient) {
    console.log(`  ⚠️  apps/.env 里没有 MINIMAX_API_KEY，跳过`);
  } else {
    const out = await handleReal();
    if (out.ok) {
      printTimeline(out.attempts);
      console.log(`  ✅ 真实响应：${truncate(out.result ?? "", 80)}`);
    } else {
      printTimeline(out.attempts);
      console.log(`  ❌ ${out.errorType}：${truncate(out.error ?? "", 60)}`);
    }
  }

  // ⑦ 真 API：burst（默认不跑，会烧 token；BURST=1 显式开启）
  if (realClient) {
    if (process.env.BURST === "1") {
      const conc = 20;
      console.log(`\n▶ ⑦ /api/real-burst（并发 ${conc} 个请求，故意撞 429；会烧 token）`);
      const burst = await handleRealBurst(conc);
      const a = burst.aggregate;
      console.log(`  📊 聚合：${a.okFirstTry} 一次成功 / ${a.okAfterRetry} 重试后成功 / ${a.failed} 失败`);
      console.log(`  📊 状态码分布：429 = ${a.total429} 次、5xx = ${a.total5xx} 次、network = ${a.totalNetwork} 次；总重试 = ${a.totalRetries} 次；总耗时 = ${(a.totalTimeMs / 1000).toFixed(1)}s`);
      console.log("  ┌─ req# ─ attempts ─ lastStatus ─ totalTime");
      for (const r of burst.results) {
        const lastStatus = String(r.attempts.at(-1)?.status ?? "?").padEnd(9);
        const verdict = r.ok ? "✅" : "❌";
        console.log(`  │ ${verdict} #${String(r.idx).padEnd(3)} ${String(r.attempts.length).padEnd(2)}     ${lastStatus} ${r.totalTimeMs.toFixed(0)}ms`);
      }
      console.log("  └─");
    } else {
      console.log(`\n  💡 想看真 429？BURST=1 yarn demo:02-04-rate-limit（并发 20 个，会烧 ~0.02 元）`);
    }
  }

  console.log("\n└────────────────────────────────────────────────────────────┘\n");
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** 把 attempts 渲染成对齐的时间线表 */
function printTimeline(attempts: AttemptRecord[]) {
  const header = "  ┌─ attempt ─ status ─ waitBefore ─ Retry-After ─ duration ─ body";
  console.log(header);
  for (const a of attempts) {
    const statusLabel = a.status === "network" ? "network  " : String(a.status).padEnd(8);
    const wait = `${a.waitBeforeMs.toFixed(0)}ms`.padEnd(10);
    const ra = a.retryAfterUsedMs === null ? "—".padEnd(10) : `${a.retryAfterUsedMs}ms`.padEnd(10);
    const dur = `${a.durationMs.toFixed(0)}ms`.padEnd(8);
    const body = a.errorMessage ? truncate(a.errorMessage, 50) : "(无 body)";
    console.log(`  │ #${a.attempt}      ${statusLabel}  ${wait}  ${ra}  ${dur}  ${body}`);
  }
  console.log("  └─");
}

// ── 4) 启动 ──────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🟢 Retry Demo 已启动`);
  console.log(`   CLI 场景跑完后，浏览器打开 http://127.0.0.1:${PORT}/ 看时间线`);
  console.log(`   按 Ctrl+C 退出`);
  if (realClient) {
    console.log(`   ✅ 检测到 MINIMAX_API_KEY：⑥ /api/real 默认跑；⑦ /api/real-burst 设 BURST=1 才跑`);
  } else {
    console.log(`   ⚠️  apps/.env 里没有 MINIMAX_API_KEY：⑥ ⑦ 跳过；只看 ①~⑤ mock`);
  }
  console.log("");

  // CLI 场景（异步跑，不阻塞 server）
  runCliScenarios().catch((err) => {
    console.error("CLI 场景异常：", err);
  });
});
