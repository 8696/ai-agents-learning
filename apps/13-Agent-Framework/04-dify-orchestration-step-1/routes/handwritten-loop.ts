/**
 * 职责：POST /api/handwritten-loop —— 跑左栏「手写循环」的请求入口。
 *
 * 数据流：校验 text → runLoop({ exposeMessages: true }) → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；调 lib/flow/handwritten-loop.ts 的主流程。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runLoop } from "../lib/flow/handwritten-loop.js";

const bodySchema = z.object({
  text: z.string().min(1).max(200),
  maxRounds: z.coerce.number().int().min(1).max(8).default(4),
});

export function mountHandwrittenLoopRoutes(router: Router): void {
  router.post("/api/handwritten-loop", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 text(1~200 字) + 可选 maxRounds(1~8，默认 4)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/handwritten-loop",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 text / maxRounds 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = await runLoop({ text: parsed.data.text, exposeMessages: true, maxRounds: parsed.data.maxRounds });
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/handwritten-loop",
        "runLoop 抛错",
        "为什么写这条日志：手写循环异常时不能静默吞掉；通常是上游模型出错或网络问题。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}