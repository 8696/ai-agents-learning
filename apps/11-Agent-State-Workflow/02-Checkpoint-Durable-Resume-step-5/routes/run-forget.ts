/**
 * 职责：POST /api/run/forget。只清空这一件任务运行在内存里的状态，磁盘文件不动。
 * 数据流：校验 runId → forgetRunMemory → 返回内存已空、磁盘上是否还有检查点。
 * 为什么单独成文件：一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { forgetRunMemory } from "../lib/flow/durable-resume.js";

const bodySchema = z.object({
  runId: z.string(),
});

export function mountRunForgetRoutes(router: Router): void {
  router.post("/api/run/forget", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-清空内存",
      "调用函数开始：POST /api/run/forget",
      "为什么写这条日志：页面点了「清空服务端内存」。当前：刚进路由。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的 runId。" } };
      logger.error(
        "路由-清空内存",
        "调用函数结束：POST /api/run/forget（失败）",
        "为什么写这条日志：没有任务运行编号。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    const result = forgetRunMemory(parsed.data.runId.trim());
    ctx.body = {
      ok: true,
      ...result,
      请求参数: { runId: parsed.data.runId },
      调用流程: [
        "从内存表删掉这一件任务运行",
        "不删磁盘上的检查点文件",
        "再读一次磁盘，证明文件还在",
      ],
    };
    logger.info(
      "路由-清空内存",
      "调用函数结束：POST /api/run/forget",
      "为什么写这条日志：内存已空，文件仍在。当前：把对照交给页面。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
