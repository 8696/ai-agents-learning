/**
 * 职责：POST /api/transform —— schema 不只校验，还能改结构（补 repaired / when）。
 * 数据流：{ raw } → 校验 → Enriched.parse；不合法时 ZodError → 400。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostTransform 封装层）；
 *   校验挡下单独写 warn；ZodError 校验失败单独写 warn（业务失败但能走通）；子调用 runTransform 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { readJsonPayload } from "../lib/http/request-guards.js";
import { runTransform } from "../lib/schema/intent.js";

export function mountTransformRoutes(router: Router): void {
  router.post("/api/transform", (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.transform",
      "调用函数开始：handlePostTransform",
      "为什么写这条日志：route 只认这一层返回的 { value: Enriched }；里面 runTransform 是真正干活的那一层（Zod.transform 演示）。当前：前端点了 transform 按钮；记入参便于核对 default 补全与新增字段。",
      {
        入参: { method: ctx.method, path: ctx.path },
        __code: `const payload = readJsonPayload(ctx);\nctx.body = { value: runTransform(payload) };`,
      },
    );
    const payload = readJsonPayload(ctx);
    if (payload === null) {
      logger.info(
        "api.transform",
        "调用函数结束：handlePostTransform",
        "为什么写这条日志：校验已回 400；route 不用再调 runTransform。当前：readJsonPayload 已返回 null（校验在内部写过 warn），route 直接 return。",
        {
          返回值: { httpStatus: 400, value: null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      return;
    }
    try {
      ctx.body = { value: runTransform(payload) };
      logger.info(
        "api.transform",
        "调用函数结束：handlePostTransform",
        "为什么写这条日志：route 要把 { value: Enriched } 写进 ctx.body 交给页面 stats 区；记是否带 repaired / when 字段。当前：runTransform 已返回。",
        {
          返回值: { value: (ctx.body as { value: unknown }).value, hasRepaired: Boolean((ctx.body as { value?: { repaired?: boolean } }).value?.repaired), hasWhen: Boolean((ctx.body as { value?: { when?: string } }).value?.when) },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        logger.warn(
          "api.transform",
          "调用函数结束：handlePostTransform（失败）",
          "为什么写这条日志：transform 前的 Intent 校验没过；issues 一起写出来便于核对哪条 field 不合法（与 /api/parse 应一致）。warn 是「业务失败但能走通」的等级。",
          {
            返回值: { httpStatus: 400, issuesCount: error.issues.length },
            耗时ms: Date.now() - tHandlerStart,
          },
        );
        ctx.status = 400;
        ctx.body = { error: "transform 前的校验没过", detail: error.issues };
        return;
      }
      logger.error(
        "api.transform",
        "调用函数结束：handlePostTransform（失败）",
        "为什么写这条日志：transform 入口抛了非 ZodError；这通常是程序 bug 不是 schema 问题，记 err 便于排错。",
        {
          返回值: { httpStatus: 500 },
          耗时ms: Date.now() - tHandlerStart,
          错误: error,
        },
      );
      throw error;
    }
  });
}