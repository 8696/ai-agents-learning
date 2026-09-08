/**
 * 职责：POST /api/full —— 不取消、跑到底的 SSE 端点（薄：闸门 → 开流 → 交给 flow）。
 * 数据流：{ message } → parseAbortBody → openSseStream → runFull → delta… → usage → [DONE]。
 * 失败：参数错 400 / 没 Key 503（普通 JSON）；上游错 → 流里的 error 帧。
 * 为什么单独成文件：这是对照基线，和 cancel / no-signal 的生命周期不同，互不 import。
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostFull 封装层）；
 *   闸门挡掉（400 / 503）单独打 info / warn 闸门拒绝；子调用 runFull 内部已自带五件套。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm } from "../lib/http/runtime-ctx.js";
import { parseAbortBody, writeRawJson } from "../lib/http/request-guards.js";
import { openSseStream } from "../lib/sse/sse-writer.js";
import { runFull } from "../lib/flow/run-full.js";
import { logger } from "../lib/logger.js";

export function mountFullRoutes(router: Router): void {
  router.post("/api/full", async (ctx: Context) => {
    ctx.respond = false;
    const tHandlerStart = Date.now();

    const parsed = parseAbortBody(ctx.request.body);
    if (!parsed.ok) {
      logger.warn(
        "api.full",
        "POST /api/full 被入参闸门挡掉",
        "为什么打：闸门挡掉没花模型额度也没走到 runFull；记 reason 便于复盘。当前：body 不合法。",
        { endpoint: "POST /api/full", reason: parsed.reason },
      );
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    if (!llm) {
      logger.error(
        "api.full",
        "POST /api/full 被无 Key 闸门挡掉",
        "为什么打：服务端兜底；apps/.env 没配当前 provider 的 Key。当前：LLM 未配置。",
        { endpoint: "POST /api/full" },
      );
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

    logger.info(
      "api.full",
      "调用函数开始：handlePostFull",
      "为什么打：route 只认这一层把 stats 写给客户端；里面 runFull 是「真活」（看「调用函数开始：runFull」）。当前：闸门全过、SSE 头已发，即将交给 runFull。",
      {
        入参: { messageLen: parsed.message.length },
        __code: `const writer = openSseStream(ctx.res);\nconst stats = await runFull({ llm, message: parsed.message, writer });`,
      },
    );

    const writer = openSseStream(ctx.res);
    const stats = await runFull({ llm, message: parsed.message, writer });
    console.log(
      `  POST /api/full  帧数=${stats.frameIdx}` +
        (stats.failed ? `  上游失败=${stats.failed.message}` : ""),
    );

    if (stats.failed) {
      logger.error(
        "api.full",
        "调用函数结束：handlePostFull（失败）",
        "为什么打：runFull 失败已发 error 帧；记 frameIdx + failed 便于对照基线和 cancel 的 usage 差异。当前：runFull 已返回。",
        {
          返回值: { frameIdx: stats.frameIdx, failed: stats.failed, elapsedMs: stats.elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
          错误: stats.failed,
        },
      );
    } else {
      logger.info(
        "api.full",
        "调用函数结束：handlePostFull",
        "为什么打：route 要把 stats 写给客户端；记帧数 + usage 摘要便于对照基线和 cancel 的差异。当前：runFull 已返回。",
        {
          返回值: { frameIdx: stats.frameIdx, elapsedMs: stats.elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    }
  });
}