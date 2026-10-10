/**
 * 职责：POST /api/loop-edge-with-counter —— 跑右栏「有次数变量」的请求入口。
 *
 * 数据流：校验 inStock / maxRounds / counterLimit → runWithCounter(...) → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；调 lib/flow/loop-edge.ts 的主流程（runWithCounter）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runWithCounter } from "../lib/flow/loop-edge.js";

const bodySchema = z.object({
  inStock: z.boolean().optional().default(false),
  maxRounds: z.coerce.number().int().min(1).max(12).default(6),
  counterLimit: z.coerce.number().int().min(1).max(12).default(3),
});

export function mountLoopEdgeWithCounterRoutes(router: Router): void {
  router.post("/api/loop-edge-with-counter", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：可选 inStock(bool) + maxRounds(1~12，默认 6) + counterLimit(1~12，默认 3)。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/loop-edge-with-counter",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 inStock / maxRounds / counterLimit 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = runWithCounter({
        inStock: parsed.data.inStock,
        maxRounds: parsed.data.maxRounds,
        counterLimit: parsed.data.counterLimit,
      });
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/loop-edge-with-counter",
        "runWithCounter 抛错",
        "为什么写这条日志：右栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}