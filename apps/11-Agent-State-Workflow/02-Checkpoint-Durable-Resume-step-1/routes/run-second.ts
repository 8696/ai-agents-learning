/**
 * 职责：POST /api/run/second。开一件新的任务运行（与 /api/run/start 等价；语义上是「开第二单」）。
 * 数据流：校验 drinkName → startRun → 返回新 runId + 初始状态。
 * 为什么单独成文件：一个业务 URL 一个文件；语义清晰，避免在「两单编号隔离」页面里复用 start 端点
 * 让人误以为第二单会覆盖第一单。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { startRun } from "../lib/flow/step-with-checkpoint.js";

const bodySchema = z.object({
  drinkName: z.string(),
});

export function mountRunSecondRoutes(router: Router): void {
  router.post("/api/run/second", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-开第二单",
      "调用函数开始：POST /api/run/second",
      "为什么写这条日志：两单编号隔离页要新开一件任务运行。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要字符串字段 drinkName" } };
      logger.error(
        "路由-开第二单",
        "调用函数结束：POST /api/run/second（失败）",
        "为什么写这条日志：请求体形状不对。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    const drinkName = parsed.data.drinkName.trim();
    if (!drinkName) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: { code: "EMPTY_DRINK_NAME", message: "第二单的饮品名称为空。请填一杯饮品名称，例如「冰美式」。" },
      };
      logger.error(
        "路由-开第二单",
        "调用函数结束：POST /api/run/second（失败）",
        "为什么写这条日志：空点单是给页面看的第一类失败（HTTP 400）。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    const result = startRun(drinkName);
    ctx.body = {
      ok: true,
      runId: result.runId,
      state: result.state,
      checkpointOnDisk: result.checkpointOnDisk,
      请求参数: { drinkName },
      调用流程: [
        "这是新一件任务运行，与已有任何 runId 互不相关",
        "startRun 写入内存（停在点单站 takeOrder）",
        "此时磁盘上还没有检查点文件",
      ],
    };
    logger.info(
      "路由-开第二单",
      "调用函数结束：POST /api/run/second",
      "为什么写这条日志：第二单已建好。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
