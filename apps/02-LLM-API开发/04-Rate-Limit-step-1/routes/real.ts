/**
 * 职责：真 API 端点 —— GET /api/real（单次）+ GET /api/real-burst（并发撞 429）。
 * 数据流：requireLlm → handleReal / handleRealBurst → ctx.body。
 * 本页教学点在 pages/real.html；无 Key 时 503（页面按钮应已 disabled）。
 *
 * 日志（§5.3.16）：调用函数 五件套（handleGetReal / handleGetRealBurst 封装层）；
 *   Key 缺失单独打 info 闸门拒绝；子调用 run-with-retry 内部已自带五件套。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readConcurrency } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { handleReal, handleRealBurst } from "../lib/flow/run-with-retry.js";
import { logger } from "../lib/logger.js";

export function mountRealRoutes(router: Router): void {
  router.get("/api/real", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.real",
        "GET /api/real 被无 Key 闸门挡掉",
        "为什么打：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "GET /api/real" },
      );
      return;
    }
    logger.info(
      "api.real",
      "调用函数开始：handleGetReal",
      "为什么打：route 只认这一层返回的真请求 stats；里面 handleReal 是「真活」（retry 套真 SDK）。当前：路由层入口即将发单次真请求。",
      {
        入参: { provider: client.provider, llmModelA: client.modelA },
        __code: `ctx.body = await handleReal();`,
      },
    );
    try {
      ctx.body = await handleReal();
      logger.info(
        "api.real",
        "调用函数结束：handleGetReal",
        "为什么打：route 要把 stats 写进 ctx.body 交给页面 stats 区。当前：handleReal 已返回。",
        {
          返回值: { ok: (ctx.body as { ok?: boolean })?.ok, attemptsTotal: (ctx.body as { attempts?: unknown[] })?.attempts?.length ?? null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      logger.error(
        "api.real",
        "调用函数结束：handleGetReal（失败）",
        "为什么打：handleReal 抛 RetryExhaustedError / NonRetryableError 都要走统一出口；记 err 便于 writeUpstreamError 决定 status。当前：handleReal 抛错。",
        {
          返回值: { mode: "real", error: err instanceof Error ? err.message : String(err) },
          耗时ms: Date.now() - tHandlerStart,
          错误: err,
        },
      );
      writeUpstreamError(ctx, err, { mode: "real" });
    }
  });

  router.get("/api/real-burst", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.real-burst",
        "GET /api/real-burst 被无 Key 闸门挡掉",
        "为什么打：服务端兜底；没 Key 并发没必要跑。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "GET /api/real-burst" },
      );
      return;
    }
    const concurrency = readConcurrency(ctx);
    logger.info(
      "api.real-burst",
      "调用函数开始：handleGetRealBurst",
      "为什么打：route 只认这一层返回的 BurstResult；里面 handleRealBurst 是「真活」（并发 N 个独立 retry）。当前：并发撞 429 入口即将发并发真请求。",
      {
        入参: { concurrency, provider: client.provider, llmModelA: client.modelA },
        __code: `ctx.body = await handleRealBurst(concurrency);`,
      },
    );
    try {
      ctx.body = await handleRealBurst(concurrency);
      logger.info(
        "api.real-burst",
        "调用函数结束：handleGetRealBurst",
        "为什么打：route 要把 BurstResult 写进 ctx.body 交给页面；记 aggregate 便于核对 429 / 5xx 分布。当前：handleRealBurst 已返回。",
        {
          返回值: {
            concurrency: (ctx.body as { concurrency?: number })?.concurrency,
            aggregate: (ctx.body as { aggregate?: unknown })?.aggregate,
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      logger.error(
        "api.real-burst",
        "调用函数结束：handleGetRealBurst（失败）",
        "为什么打：handleRealBurst 抛 RetryExhaustedError 走统一出口；记 err 便于 writeUpstreamError 决定 status。当前：handleRealBurst 抛错。",
        {
          返回值: { mode: "real-burst", error: err instanceof Error ? err.message : String(err) },
          耗时ms: Date.now() - tHandlerStart,
          错误: err,
        },
      );
      writeUpstreamError(ctx, err, { mode: "real-burst" });
    }
  });
}