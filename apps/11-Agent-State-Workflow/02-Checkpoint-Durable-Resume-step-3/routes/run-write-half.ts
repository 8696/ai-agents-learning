/**
 * 职责：POST /api/run/write-half。故意把 data/checkpoints/{runId}.json 写成半截，模拟「写到一半断电」。
 * 数据流：校验 runId → writeHalfCheckpointFile → 返回截断前后长度 + 残片头尾。
 * 为什么单独成文件：一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { writeHalfCheckpointFile } from "../lib/flow/write-half-file.js";

const bodySchema = z.object({
  runId: z.string(),
});

export function mountRunWriteHalfRoutes(router: Router): void {
  router.post("/api/run/write-half", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-故意写半份",
      "调用函数开始：POST /api/run/write-half",
      "为什么写这条日志：半份文件页点了「故意写半份」。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success || !parsed.data.runId.trim()) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要非空的 runId。" } };
      logger.error(
        "路由-故意写半份",
        "调用函数结束：POST /api/run/write-half（失败）",
        "为什么写这条日志：没有任务运行编号。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    try {
      const result = writeHalfCheckpointFile(parsed.data.runId.trim());
      ctx.body = {
        ok: true,
        ...result,
        请求参数: { runId: parsed.data.runId },
        调用流程: [
          "读 data/checkpoints/{runId}.json 当前完整内容",
          "截掉一半",
          "用 fs.writeFileSync 覆盖写回（模拟写到一半断电）",
          "磁盘上 step-NNNN 历史副本没被破坏",
          "下一步 readCheckpoint 会从主文件 parse 失败，按编号降序 fallback 到历史副本",
        ],
      };
      logger.info(
        "路由-故意写半份",
        "调用函数结束：POST /api/run/write-half",
        "为什么写这条日志：主文件已残。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const client = err.code === "CHECKPOINT_NOT_ON_DISK";
      ctx.status = client ? 400 : 500;
      ctx.body = {
        ok: false,
        error: { code: err.code ?? "WRITE_HALF_FAILED", message: err.message ?? "故意写半份失败" },
      };
      logger.error(
        "路由-故意写半份",
        "调用函数结束：POST /api/run/write-half（失败）",
        "为什么写这条日志：磁盘上还没有主文件。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
