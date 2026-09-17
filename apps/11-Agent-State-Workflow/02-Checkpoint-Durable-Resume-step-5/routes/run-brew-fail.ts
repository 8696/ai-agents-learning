/**
 * 职责：POST /api/run/brew-fail。设 brewFailOnStep 标志（变体 G 之外的「节点失败 ≠ 进程被杀掉」对照入口）。
 * 数据流：校验 runId → setBrewFailFlag → 返回新 state。
 * 为什么单独成文件：一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { setBrewFailFlag } from "../lib/flow/brew-fail.js";

const bodySchema = z.object({
  runId: z.string(),
});

export function mountRunBrewFailRoutes(router: Router): void {
  router.post("/api/run/brew-fail", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-设 brewHot 失败标志",
      "调用函数开始：POST /api/run/brew-fail",
      "为什么写这条日志：节点失败对照页点了「让 brewHot 失败」。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的 runId。" } };
      logger.error(
        "路由-设 brewHot 失败标志",
        "调用函数结束：POST /api/run/brew-fail（失败）",
        "为什么写这条日志：没有任务运行编号。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    try {
      const result = setBrewFailFlag(parsed.data.runId.trim());
      ctx.body = {
        ok: true,
        runId: parsed.data.runId,
        brewFailOnStep: result.brewFailOnStep,
        lastError: result.lastError,
        请求参数: { runId: parsed.data.runId },
        调用流程: [
          "在内存里把 brewFailOnStep 设成 true",
          "**不**调 brewHot 节点函数，**不**写磁盘",
          "下一步走 brewHot 时节点函数会写 lastError 并沿失败边走 brewFailed",
        ],
      };
      logger.info(
        "路由-设 brewHot 失败标志",
        "调用函数结束：POST /api/run/brew-fail",
        "为什么写这条日志：标志已设上。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const client = err.code === "RUN_NOT_FOUND";
      ctx.status = client ? 400 : 500;
      ctx.body = {
        ok: false,
        error: { code: err.code ?? "BREW_FAIL_FLAG_FAILED", message: err.message ?? "设 brewHot 失败标志失败" },
      };
      logger.error(
        "路由-设 brewHot 失败标志",
        "调用函数结束：POST /api/run/brew-fail（失败）",
        "为什么写这条日志：内存里没有这件任务运行。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
