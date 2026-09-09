/**
 * 职责：POST /api/token-budget-force-error —— 教学演示用的「上游失败」端点，立刻回 502。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

export function mountErrorDemoRoutes(router: Router): void {
  router.post("/api/token-budget-force-error", async (ctx: Context) => {
    logger.warn("token-budget.error_demo", "调用函数结束：token-budget-force-error", "为什么打：教学演示 5xx 通道", {
      返回值: { status: 502, error: "upstream_failed", message: "演示：模拟上游失败" },
    });
    ctx.status = 502;
    ctx.body = {
      error: "upstream_failed",
      message: "演示：模拟上游失败（5xx · 这一路不是 LLM 真挂，是教学演示）",
    };
  });
}
