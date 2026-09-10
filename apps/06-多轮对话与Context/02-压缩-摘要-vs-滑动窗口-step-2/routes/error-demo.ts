/**
 * 职责：POST /api/summarize-force-error —— 教学演示用的「上游失败」端点，立刻回 502。
 *
 * 数据流：无入参 → ctx.status = 502 + 结构化错误 → 前端红字 + #status-pill ❌。
 *
 * 教学锚点（§5.3.2 #2 · 「错误处理 ≥2 类，能一眼分开」）：
 *   - 类 A（4xx）走 /api/summarize 的 Zod 校验 → 400（缺字段 / 超上限）
 *   - 类 B（5xx）走 /api/summarize-force-error → 502（演示上游真挂时页面长什么样）
 *   两类失败通道不同，错误文案颜色 / #status-pill 文案不同 → 学习者一眼分开。
 *
 * **不是 mock LLM**：本端点本身**不**调模型（也不假装调过），
 * 只是用 HTTP 502 演示「真上游失败时 UI 该怎么显示」。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

export function mountErrorDemoRoutes(router: Router): void {
  router.post("/api/summarize-force-error", async (ctx: Context) => {
    logger.warn("summarize.error_demo", "调用函数结束：summarize-force-error", "为什么写这条日志：教学演示 5xx 通道；让学习者看见上游失败时页面长什么样", {
      返回值: { status: 502, error: "upstream_failed", message: "演示：模拟上游失败" },
    });
    ctx.status = 502;
    ctx.body = {
      error: "upstream_failed",
      message: "演示：模拟上游失败（5xx · 这一路不是 LLM 真挂，是教学演示）",
    };
  });
}
