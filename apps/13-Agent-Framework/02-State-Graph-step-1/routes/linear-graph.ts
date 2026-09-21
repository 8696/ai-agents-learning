/**
 * 职责：GET / POST /api/linear-graph。
 * GET 只返回声明步骤和源代码；POST 才 compile + stream 跑一遍。
 *
 * 数据流：校验 drinkName → describeLinearGraph / runLinearGraph → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；对照的手写侧以后另开 URL。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { runLinearGraph } from "../lib/flow/linear-graph.js";
import { describeLinearGraph } from "../lib/flow/linear-graph-view.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  drinkName: z.string().trim().min(1, "客人口述不能为空。"),
});

export function mountLinearGraphRoutes(router: Router): void {
  router.get("/api/linear-graph", (ctx: Context) => {
    const t0 = Date.now();
    logger.info(
      "GET /api/linear-graph",
      "调用函数开始：GET /api/linear-graph",
      "为什么写这条日志：页面加载先摊开声明，不跑图。当前：只读。",
      { 入参: {}, __code: "describeLinearGraph()" },
    );
    const view = describeLinearGraph();
    ctx.body = { ok: true, ...view };
    logger.info(
      "GET /api/linear-graph",
      "调用函数结束：GET /api/linear-graph",
      "为什么写这条日志：页面要用 declaration / edges 画声明流程。当前：已返回。",
      { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
    );
  });

  router.post("/api/linear-graph", async (ctx: Context) => {
    const t0 = Date.now();
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "客人口述不能为空。左边输入框写一句再点「跑这张线性图」。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "POST /api/linear-graph",
        "调用函数结束：POST /api/linear-graph（失败）",
        "为什么写这条日志：这是第一类失败（4xx 空入参），和第二类 5xx 分开。当前：返回 400。",
        { 入参: ctx.request.body ?? {}, 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    logger.info(
      "POST /api/linear-graph",
      "调用函数开始：POST /api/linear-graph",
      "为什么写这条日志：入参过了才进主流程。当前：准备 compile + stream。",
      { 入参: parsed.data, __code: "runLinearGraph(drinkName)" },
    );
    try {
      const view = describeLinearGraph();
      const result = await runLinearGraph(parsed.data.drinkName);
      ctx.body = { ok: true, ...view, ...result };
      logger.info(
        "POST /api/linear-graph",
        "调用函数结束：POST /api/linear-graph",
        "为什么写这条日志：页面要用 runtime 把每一站摊开。当前：已返回。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "POST /api/linear-graph",
        "调用函数结束：POST /api/linear-graph（失败）",
        "为什么写这条日志：图在 compile 或 stream 时炸了，要让页面红字看见。当前：返回 500。",
        { 入参: parsed.data, 返回值: { name: error instanceof Error ? error.name : "Error", message }, 耗时ms: Date.now() - t0 },
      );
    }
  });
}
