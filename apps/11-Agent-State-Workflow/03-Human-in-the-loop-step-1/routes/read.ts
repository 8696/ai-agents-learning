/**
 * 职责：POST /api/read —— 只读工具（getBalance）的入口。不写 pending，不进等待节点。
 * 数据流：无 body → readBalance → ctx.body。
 * 为什么单独成文件：只读路径是独立的业务 URL；和提议 / 通过 / 拒绝并列，不能塞进 propose.ts。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { readBalance } from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

export function mountReadRoutes(router: Router): void {
  router.post("/api/read", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/read",
      "调用函数开始：POST /api/read",
      "为什么写这条日志：这是「查余额」入口，必须不进等待节点、不调 executeTransfer。当前：还没进核心文件。",
      { 入参: {}, __code: "const snapshot = readBalance(); ctx.body = { ok: true, snapshot };" },
    );
    const snapshot = readBalance();
    ctx.body = { ok: true, snapshot };
    logger.info(
      "POST /api/read",
      "调用函数结束：POST /api/read",
      "为什么写这条日志：页面要看见 getBalanceCallCount 已经 +1，transferCallCount 仍是 0。当前：核心已返回。",
      { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
    );
  });
}
