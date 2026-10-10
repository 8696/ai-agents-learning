/**
 * 职责：POST /api/code-node-with-output —— 跑左栏「写出输出变量」的请求入口。
 *
 * 数据流：校验 cupSize / drinkType → runCodeNodeWithOutput(...) → ctx.body。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runCodeNodeWithOutput } from "../lib/flow/code-node.js";

const bodySchema = z.object({
  cupSize: z.enum(["大杯", "中杯", "小杯"]),
  drinkType: z.enum(["热饮", "冰饮"]),
});

export function mountCodeNodeWithOutputRoutes(router: Router): void {
  router.post("/api/code-node-with-output", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 cupSize(大杯/中杯/小杯) + drinkType(热饮/冰饮)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/code-node-with-output",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 cupSize / drinkType 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = runCodeNodeWithOutput(parsed.data);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/code-node-with-output",
        "runCodeNodeWithOutput 抛错",
        "为什么写这条日志：左栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}