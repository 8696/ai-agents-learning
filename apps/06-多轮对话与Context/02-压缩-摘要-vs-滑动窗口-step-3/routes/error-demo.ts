/**
 * 职责：POST /api/three-way-force-error —— 教学演示用的「演示后端 5xx」端点，立刻回 502。
 *
 * 教学锚点（§5.3.2 #2 · 「错误处理 ≥2 类，能一眼分开」）：
 *   - 类 A（4xx）走 /api/three-way 的 Zod 校验 → 400
 *   - 类 B（5xx）走 /api/three-way-force-error → 502
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

export function mountErrorDemoRoutes(router: Router): void {
  router.post("/api/three-way-force-error", async (ctx: Context) => {
    logger.warn("three-way.error_demo", "调用函数结束：three-way-force-error", "为什么写这条日志：教学演示 5xx 通道；让学习者看见后端 5xx 时页面长什么样", {
      返回值: { status: 502, error: "upstream_failed", message: "演示：模拟后端 5xx" },
    });
    ctx.status = 502;
    ctx.body = {
      error: "upstream_failed",
      message: "演示：模拟后端 5xx（5xx · 这一路不是 LLM 真挂，是教学演示）",
    };
  });
}
