/**
 * 职责：POST /api/reset —— 把内存账本和待审批清回初始，便于再走一遍。
 * 数据流：无 body → resetDemo → ctx.body。
 * 为什么单独成文件：重置是独立 URL，不能塞进提议或通过。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { resetDemo } from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

export function mountResetRoutes(router: Router): void {
  router.post("/api/reset", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/reset",
      "调用函数开始：POST /api/reset",
      "为什么写这条日志：同一页要能重新演示「点头前余额不变」。当前：准备清表。",
      { 入参: {}, __code: "const snapshot = resetDemo(); ctx.body = { ok: true, snapshot };" },
    );
    const snapshot = resetDemo();
    ctx.body = { ok: true, snapshot };
    logger.info(
      "POST /api/reset",
      "调用函数结束：POST /api/reset",
      "为什么写这条日志：重置后次数应为 0。当前：已写 200。",
      { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
    );
  });
}
