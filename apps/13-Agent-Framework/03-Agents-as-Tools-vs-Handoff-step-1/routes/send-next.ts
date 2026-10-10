/**
 * 职责：POST /api/send-next —— 推进一次「用户说了下一句」。
 *
 * 数据流：校验 mode + currentAgent + userTurnCount → sendNext（lib/flow）→ ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；调用 lib/flow/agents-as-tools-vs-handoff.ts 的主流程。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { sendNext } from "../lib/flow/agents-as-tools-vs-handoff.js";

const bodySchema = z.object({
  mode: z.enum(["tool", "handoff"]),
  currentAgent: z.enum(["host", "refund"]),
  userTurnCount: z.coerce.number().int().min(0).max(20),
});

export function mountSendNextRoutes(router: Router): void {
  router.post("/api/send-next", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 mode(tool/handoff) + currentAgent(host/refund) + userTurnCount(整数 ≥ 0)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/send-next",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 mode / currentAgent / userTurnCount 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = sendNext(parsed.data);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/send-next",
        "sendNext 抛错",
        "为什么写这条日志：主流程异常时不能静默吞掉；这一步通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}