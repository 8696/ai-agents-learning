/**
 * 职责：POST /api/global-env-vs-state —— 跑 step-5 加 page「正确 vs 反例 · 状态写在哪」的请求入口（双栏对照）。
 *
 * 数据流：校验 cupSize + drinkType + side（'correct' / 'polluted'）→ runStateInDeclaredState 或 runStatePollutedToGlobal → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；调 lib/flow/global-env-vs-state.ts 的主流程。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod-v4";
import { logger } from "../lib/logger.js";
import { runStateInDeclaredState, runStatePollutedToGlobal } from "../lib/flow/global-env-vs-state.js";

const bodySchema = z.object({
  cupSize: z.enum(["大杯", "中杯", "小杯"]),
  drinkType: z.enum(["热饮", "冰饮"]),
  side: z.enum(["correct", "polluted"]),
});

export function mountGlobalEnvVsStateRoutes(router: Router): void {
  router.post("/api/global-env-vs-state", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法：必须传 cupSize(大杯/中杯/小杯) + drinkType(热饮/冰饮) + side('correct' / 'polluted')。",
        issues: parsed.error.issues,
      };
      logger.warn(
        "routes/global-env-vs-state",
        "请求被 400 拦下",
        "为什么写这条日志：前端传错 cupSize / drinkType / side 时让排查更快。当前：safeParse 失败。",
        { issues: parsed.error.issues },
      );
      return;
    }
    try {
      const out = parsed.data.side === "correct"
        ? runStateInDeclaredState({ cupSize: parsed.data.cupSize, drinkType: parsed.data.drinkType })
        : runStatePollutedToGlobal({ cupSize: parsed.data.cupSize, drinkType: parsed.data.drinkType });
      ctx.body = { ok: true, ...out };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
      logger.error(
        "routes/global-env-vs-state",
        "runGlobalEnvVsState 抛错",
        "为什么写这条日志：右栏主流程是本地 mock，抛错通常是内部 bug。当前：catch 已接住。",
        { error: message },
      );
    }
  });
}