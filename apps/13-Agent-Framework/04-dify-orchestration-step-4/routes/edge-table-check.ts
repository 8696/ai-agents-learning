/**
 * 职责：POST /api/edge-table-check —— 跑右栏「手写边表核对」的请求入口。
 *
 * 数据流：校验 intent / paymentStatus → runEdgeTableCheck(...) → ctx.body（含 declared edgeTable）。
 * 为什么单独成文件：一个业务 URL 一个文件；调 lib/flow/conditional-vs-edge-table.ts 的主流程（runEdgeTableCheck）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runEdgeTableCheck } from "../lib/flow/conditional-vs-edge-table.js";

const bodySchema = z.object({
  intent: z.enum(["热饮", "冰饮", "未付款想出品"]),
  paymentStatus: z.enum(["已付款", "未付款"]),
});

export function mountEdgeTableCheckRoutes(router: Router): void {
  router.post("/api/edge-table-check", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 intent(热饮/冰饮/未付款想出品) + paymentStatus(已付款/未付款)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/edge-table-check",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 intent / paymentStatus 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = runEdgeTableCheck(parsed.data);
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/edge-table-check",
        "runEdgeTableCheck 抛错",
        "为什么写这条日志：右栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}