/**
 * 职责：POST /api/run/start。只建任务运行编号和初始状态，不写检查点文件。
 * 数据流：校验 drinkName → startRun → 返回 runId + 状态。磁盘上此时还没有文件。
 * 为什么单独成文件：一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { startRun } from "../lib/flow/step-with-checkpoint.js";

const bodySchema = z.object({
  drinkName: z.string(),
});

export function mountRunStartRoutes(router: Router): void {
  router.post("/api/run/start", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-开始任务运行",
      "调用函数开始：POST /api/run/start",
      "为什么写这条日志：页面点了「开始这件任务运行」。当前：刚进路由，还没建编号。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要字符串字段 drinkName" } };
      logger.error(
        "路由-开始任务运行",
        "调用函数结束：POST /api/run/start（失败）",
        "为什么写这条日志：请求体形状不对。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    const drinkName = parsed.data.drinkName.trim();
    if (!drinkName) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: { code: "EMPTY_DRINK_NAME", message: "点单名称为空。请填一杯饮品名称，例如「热拿铁」。" },
      };
      logger.error(
        "路由-开始任务运行",
        "调用函数结束：POST /api/run/start（失败）",
        "为什么写这条日志：空点单是给页面看的第一类失败（HTTP 400）。当前：已返回 400。",
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
      调用流程: ["校验点单名称", "startRun 写入内存（停在点单站 takeOrder）", "此时磁盘上还没有检查点文件"],
    };
    logger.info(
      "路由-开始任务运行",
      "调用函数结束：POST /api/run/start",
      "为什么写这条日志：任务运行已建好。当前：返回 runId，等用户点走一步。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
