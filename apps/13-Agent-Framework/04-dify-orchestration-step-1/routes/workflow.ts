/**
 * 职责：POST /api/workflow —— 跑右栏「工作流画布」的请求入口（不调 LLM）。
 *
 * 数据流：校验 text → runWorkflowMock(text) → ctx.body（nodes / edges / variables / hiddenMechanism）。
 * 为什么单独成文件：一个业务 URL 一个文件；调 lib/flow/workflow.ts 的主流程。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runWorkflowMock } from "../lib/flow/workflow.js";

const bodySchema = z.object({
  text: z.string().min(1).max(200),
});

export function mountWorkflowRoutes(router: Router): void {
  router.post("/api/workflow", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 text(1~200 字)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/workflow",
        "请求被 400 拦下",
        "为什么写这条日志：右栏不调 LLM，但入参仍要校验（text 空字符串不能跑画布）。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = runWorkflowMock(parsed.data.text);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/workflow",
        "runWorkflowMock 抛错",
        "为什么写这条日志：右栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}