/**
 * 职责：POST /api/run/next。上一件任务运行到 okEnd 后，开新业务（生成新 runId），可挂 parentRunId 引用上一件。
 * 数据流：校验 previousRunId + drinkName → nextRun → 返回新 runId + parentRunId + 上一件最后一份快照（若挂）。
 * 为什么单独成文件：一个业务 URL 一个文件。和 /api/run/start、/api/run/second 拆开。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { nextRun } from "../lib/flow/next-run.js";

const bodySchema = z.object({
  previousRunId: z.string().nullable().optional(),
  drinkName: z.string(),
});

export function mountRunNextRoutes(router: Router): void {
  router.post("/api/run/next", (ctx: Context, _next: Next) => {
    const started = Date.now();
    logger.info(
      "路由-开下一件业务",
      "调用函数开始：POST /api/run/next",
      "为什么写这条日志：终态开新业务页点了「开下一件」。",
      { 入参: ctx.request.body },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_BODY", message: "请求体需要字符串字段 drinkName" } };
      logger.error(
        "路由-开下一件业务",
        "调用函数结束：POST /api/run/next（失败）",
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
        error: { code: "EMPTY_DRINK_NAME", message: "下一件的饮品名称为空。请填一杯饮品名称。" },
      };
      logger.error(
        "路由-开下一件业务",
        "调用函数结束：POST /api/run/next（失败）",
        "为什么写这条日志：空点单。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }

    const previousRunId =
      parsed.data.previousRunId && parsed.data.previousRunId.trim()
        ? parsed.data.previousRunId.trim()
        : null;

    try {
      const result = nextRun({ previousRunId, drinkName });
      ctx.body = {
        ok: true,
        runId: result.runId,
        state: result.state,
        checkpointOnDisk: result.checkpointOnDisk,
        parentRunId: result.parentRunId,
        previousRunFinalSnapshot: result.previousRunFinalSnapshot,
        请求参数: { previousRunId, drinkName },
        调用流程: previousRunId
          ? [
              "读上一件任务运行编号在磁盘上的最后一份检查点",
              "确认上一件 currentNode 已是终止站 okEnd",
              "开一件新任务运行（生成新 runId）",
              "把上一件 runId 作为 parentRunId 挂到响应里",
              "上一件的检查点不被改写",
            ]
          : [
              "没有 previousRunId，等价于 /api/run/start",
              "开一件新任务运行（生成新 runId）",
              "parentRunId 为 null（做法 1）",
            ],
      };
      logger.info(
        "路由-开下一件业务",
        "调用函数结束：POST /api/run/next",
        "为什么写这条日志：下一件已建好。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const client = err.code === "NEXT_RUN_BEFORE_DONE" || err.code === "PREVIOUS_RUN_NO_CHECKPOINT";
      ctx.status = client ? 400 : 500;
      ctx.body = {
        ok: false,
        error: {
          code: err.code ?? "NEXT_RUN_FAILED",
          message: err.message ?? "开下一件失败",
        },
      };
      logger.error(
        "路由-开下一件业务",
        "调用函数结束：POST /api/run/next（失败）",
        "为什么写这条日志：上一件没到终止站，或磁盘上无检查点。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
    }
  });
}
