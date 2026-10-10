/**
 * 职责：POST /api/orchestrator —— 跑编排者-工人模式（拆 + 并行 + 汇总）。
 *
 * 数据流：校验 orderSlip → runOrchestrator({ orderSlip }) [lib/flow/orchestrator.ts] → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；route 不调 LLM、不写并行调度——只做入参校验 + 调核心文件。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runOrchestrator } from "../lib/flow/orchestrator.js";

const bodySchema = z.object({
  orderSlip: z.string().min(1).max(500),
});

export function mountOrchestratorRoutes(router: Router): void {
  router.post("/api/orchestrator", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 orderSlip（1~500 字的客人原话）。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/orchestrator",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 orderSlip 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = await runOrchestrator({ orderSlip: parsed.data.orderSlip });
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      const body: Record<string, unknown> = { ok: false, error: message };
      if (error instanceof Error && (error as { issues?: unknown }).issues) {
        body.issues = (error as { issues?: unknown }).issues;
      }
      ctx.body = body;
      logger.error(
        "routes/orchestrator",
        "runOrchestrator 抛错",
        "为什么写这条日志：编排者 / 工人 / 汇总者任一 LLM 抛错都不能静默吞；通常是上游模型错误、网络、或 LLM 响应字段缺失。当前：catch 已接住。",
        { error: message, issues: (error as { issues?: unknown }).issues ?? null },
      );
    }
  });
}
