/**
 * 职责：POST /api/parse —— 同一份 payload 同时走 parse 语义和 safeParse 形状。
 * 数据流：{ raw } → 校验 → runParse → ctx.body。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostParse 封装层）；
 *   校验挡下单独写 warn；子调用 runParse 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { readJsonPayload } from "../lib/http/request-guards.js";
import { runParse } from "../lib/schema/intent.js";

export function mountParseRoutes(router: Router): void {
  router.post("/api/parse", (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.parse",
      "调用函数开始：handlePostParse",
      "为什么写这条日志：route 只认这一层返回的 { parseOk, value, safeParse }；里面 runParse 是真正干活的那一层（Zod 校验演示）。当前：前端点了 parse 按钮；记录入参路径便于核对。",
      {
        入参: { method: ctx.method, path: ctx.path },
        __code: `const payload = readJsonPayload(ctx);\nctx.body = runParse(payload);`,
      },
    );
    const payload = readJsonPayload(ctx);
    if (payload === null) {
      logger.info(
        "api.parse",
        "调用函数结束：handlePostParse",
        "为什么写这条日志：校验已回 400；route 不用再调 runParse。当前：readJsonPayload 已返回 null（校验在内部写过 warn），route 直接 return。",
        {
          返回值: { httpStatus: 400, parseOk: null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      return;
    }
    const result = runParse(payload);
    ctx.body = result;
    logger.info(
      "api.parse",
      "调用函数结束：handlePostParse",
      "为什么写这条日志：route 要把 runParse 的结果写进 ctx.body 交给页面；记 parseOk / issuesCount 便于核对「同一份 payload 的 parse vs safeParse」差异。当前：runParse 已返回。",
      {
        返回值: { parseOk: result.parseOk, value: "value" in result ? result.value : null, safeParseSuccess: result.safeParse.success },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });
}