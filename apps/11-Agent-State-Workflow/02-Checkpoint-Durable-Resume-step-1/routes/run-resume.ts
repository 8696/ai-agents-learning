/**
 * 职责：POST /api/run/resume。按任务运行编号从磁盘加载检查点，写回内存。
 * 数据流：校验 runId → resumeFromDisk → 返回停住的当前节点和文件全文。
 * 为什么单独成文件：一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { NODE_LABELS } from "../lib/flow/cafe-graph.js";
import { resumeFromDisk } from "../lib/flow/durable-resume.js";

const bodySchema = z.object({
  runId: z.string(),
});

export function mountRunResumeRoutes(router: Router): void {
  router.post("/api/run/resume", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-从磁盘恢复",
      "调用函数开始：POST /api/run/resume",
      "为什么写这条日志：页面点了「从磁盘恢复到内存」。当前：刚进路由。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的 runId。" } };
      logger.error(
        "路由-从磁盘恢复",
        "调用函数结束：POST /api/run/resume（失败）",
        "为什么写这条日志：没有任务运行编号。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    try {
      const result = resumeFromDisk(parsed.data.runId.trim());
      ctx.body = {
        ok: true,
        ...result,
        请求参数: { runId: parsed.data.runId },
        调用流程: [
          "readCheckpoint 只读磁盘",
          "把快照写回内存表",
          "当前节点（currentNode）是 " + NODE_LABELS[result.state.currentNode] + "，不是点单站 takeOrder",
        ],
      };
      logger.info(
        "路由-从磁盘恢复",
        "调用函数结束：POST /api/run/resume",
        "为什么写这条日志：内存已按磁盘快照接上。当前：可以把走一步接着跑。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      ctx.status = err.code === "CHECKPOINT_NOT_ON_DISK" ? 404 : 500;
      ctx.body = {
        ok: false,
        error: {
          code: err.code ?? "RESUME_FAILED",
          message: err.message ?? "从磁盘恢复失败",
        },
      };
      logger.error(
        "路由-从磁盘恢复",
        "调用函数结束：POST /api/run/resume（失败）",
        "为什么写这条日志：磁盘上没有可加载的检查点。当前：已返回错误给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
