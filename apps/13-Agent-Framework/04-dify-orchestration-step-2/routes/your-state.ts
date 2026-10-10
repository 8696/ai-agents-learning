/**
 * 职责：POST /api/your-state —— 跑右栏「你自己的 state」的请求入口。
 *
 * 数据流：校验 text1 + text2 → runYourState({ text1, text2 }) → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；调 lib/flow/your-state.ts 的主流程。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runYourState } from "../lib/flow/your-state.js";

const bodySchema = z.object({
  text1: z.string().min(1).max(200),
  text2: z.string().min(1).max(200),
});

export function mountYourStateRoutes(router: Router): void {
  router.post("/api/your-state", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 text1(1~200 字) + text2(1~200 字)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/your-state",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 text1 / text2 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = runYourState(parsed.data);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/your-state",
        "runYourState 抛错",
        "为什么写这条日志：右栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}