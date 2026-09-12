/**
 * 职责：GET /api/demo-error —— 故意 5xx。和「演示上游失败」按钮配对 —— 让 #status-pill 变 ❌。
 * 数据流：前端点「演示上游失败」→ fetch("/api/demo-error", {forceError:true}) → 5xx。
 * 这是 §5.3.2 #2「第二类错误」：与「空输入 400」不同的失败通道。
 *
 * 本步不调 LLM（§5.3.0 例外）—— 错误演示改成后端 5xx（同样演示「上游失败」语义，不依赖 LLM）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

export function mountDemoErrorRoute(router: Router): void {
  router.get("/api/demo-error", (ctx: Context) => {
    logger.warn(
      "│ 调用函数-/api/demo-error",
      "调用函数结束：/api/demo-error（演示上游失败）",
      "为什么写这条日志：让学习者看见「演示上游失败」按钮触发时是这一条路径走的。" +
        " 当前：本步不调 LLM，但仍演示「上游 5xx」的失败通道，让 #status-pill 切 ❌。",
      { 返回值: { status: 500 }, 耗时ms: 0 },
    );
    ctx.status = 500;
    ctx.body = {
      ok: false,
      error: "演示上游失败（demo-error）：模拟服务端 5xx 响应",
      hint: "这是 §5.3.2 第二类错误（5xx）。本步不调 LLM，但保留两条失败通道便于演示错误态。",
    };
  });
}