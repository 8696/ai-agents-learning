/**
 * 职责：POST /api/agent-app —— 跑中栏「智能体应用」的请求入口。
 *
 * 数据流：校验 text → runAsAgentApp(text) → 只返 { roundsHidden, finalReply, toolTrace }（messages 数组不返）。
 * 为什么单独成文件：一个业务 URL 一个文件；调 lib/flow/agent-app.ts 的主流程。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runAsAgentApp } from "../lib/flow/agent-app.js";

const bodySchema = z.object({
  text: z.string().min(1).max(200),
  maxRounds: z.coerce.number().int().min(1).max(8).default(4),
});

export function mountAgentAppRoutes(router: Router): void {
  router.post("/api/agent-app", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 text(1~200 字) + 可选 maxRounds(1~8，默认 4)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/agent-app",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 text / maxRounds 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = await runAsAgentApp(parsed.data.text, parsed.data.maxRounds);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/agent-app",
        "runAsAgentApp 抛错",
        "为什么写这条日志：智能体应用这一栏调的是同一个 while，抛错通常是上游模型出错。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}