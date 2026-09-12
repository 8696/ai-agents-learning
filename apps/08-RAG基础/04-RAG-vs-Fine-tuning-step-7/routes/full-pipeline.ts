/**
 * 职责：POST /api/full-pipeline —— 混合 pipeline 端点（检索 + system + 调模型）。
 * 数据流：入参 { question, topK, systemTemplate } → lib/flow/full-pipeline.ts → 写 ctx.body。
 * 演示「混合」：事实来自 corpus（可被 /api/corpus-edit 改），口吻来自 system（3 种模板可选）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { fullPipeline } from "../lib/flow/full-pipeline.js";
import { logger } from "../lib/logger.js";

export function mountFullPipelineRoute(router: Router): void {
  router.post("/api/full-pipeline", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    logger.info(
      "server.full-pipeline",
      "调用函数开始：/api/full-pipeline",
      "为什么写这条日志：step-7 「混合 pipeline」入口；下一步交给本步核心（检索 + system + 调模型）。",
      {
        入参: body,
        __code: "const result = await fullPipeline(ctx.request.body);",
      },
    );
    try {
      const result = await fullPipeline(ctx.request.body);
      logger.info(
        "server.full-pipeline",
        "调用函数结束：/api/full-pipeline",
        `为什么写这条日志：混合 pipeline 已跑完 → systemTemplate=${result.systemTemplate} → 写 ctx.body。`,
        {
          返回值: { systemTemplate: result.systemTemplate, factLayer: result.fact.slice(0, 30) },
          耗时ms: 0,
        },
      );
      ctx.body = result;
    } catch (err: unknown) {
      logger.error(
        "server.full-pipeline",
        "调用函数结束：/api/full-pipeline（失败）",
        "为什么写这条日志：要让学习者看到失败时是哪个端点挂了。",
        {
          返回值: {
            error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
          },
          耗时ms: 0,
        },
      );
      ctx.status = err instanceof Error && err.message.includes("问题不能为空") ? 400 : 500;
      ctx.body = { error: err instanceof Error ? err.message : String(err) };
    }
  });
}