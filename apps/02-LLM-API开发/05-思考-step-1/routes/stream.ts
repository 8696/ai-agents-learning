/**
 * 职责：POST /api/stream —— 薄分叉：校验之后按 protocol 交给 A 或 B 两个 handler。
 * 数据流：body.protocol === "A" → handleStreamA（openai）；否则 handleStreamB（anthropic）。
 * if 只出现在这里，禁止下沉到 lib/ 里再按协议分叉。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostStream 封装层）；
 *   校验挡下单独写 warn / info；子调用 handleStreamA / handleStreamB 内部已自带五条日志。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseStreamBody, requireProviderLlm } from "../lib/http/request-guards.js";
import { handleStreamA } from "./stream-a.js";
import { handleStreamB } from "./stream-b.js";
import { logger } from "../lib/logger.js";

export function mountStreamRoutes(router: Router): void {
  router.post("/api/stream", async (ctx: Context, _next: Next) => {
    const tHandlerStart = Date.now();
    const body = parseStreamBody(ctx);
    if (!body) {
      logger.warn(
        "api.stream",
        "POST /api/stream 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到 A/B handler；记 reason 便于复盘。当前：body 不合法。",
        { endpoint: "POST /api/stream" },
      );
      return;
    }
    const llm = requireProviderLlm(ctx, body.provider);
    if (!llm) {
      logger.info(
        "api.stream",
        "POST /api/stream 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；provider 对应的 Key 缺失；写一帧 error。当前：apps/.env 当前 provider 无 Key。",
        { endpoint: "POST /api/stream", provider: body.provider },
      );
      return;
    }
    // 通过校验之后才改成原始 res：400/没 Key 仍走 koa JSON，页面能读到 HTTP 状态码
    ctx.respond = false;

    logger.info(
      "api.stream",
      "调用函数开始：handlePostStream",
      "为什么写这条日志：route 只认这一层把 SSE 帧交给客户端；里面 A/B handler 是真正干活的那一层。当前：校验全过、SSE 头即将发出；按 protocol 分叉到 handleStreamA 或 handleStreamB。",
      {
        入参: { provider: body.provider, protocol: body.protocol, thinkingOn: body.thinkingOn, reasoningSplit: body.reasoningSplit, turnsCount: body.messages.length },
        __code: `if (body.protocol === "A") await handleStreamA(llm, body, ctx.res);\nelse await handleStreamB(llm, body, ctx.res);`,
      },
    );

    if (body.protocol === "A") {
      await handleStreamA(llm, body, ctx.res);
    } else {
      await handleStreamB(llm, body, ctx.res);
    }

    logger.info(
      "api.stream",
      "调用函数结束：handlePostStream",
      "为什么写这条日志：route 已经把 thinking-map + [DONE] 写出，连接关闭；写耗时便于核对流式总耗时。当前：handler 已返回。",
      {
        返回值: { provider: body.provider, protocol: body.protocol },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });
}