/**
 * 职责：POST /api/propose —— 发起一笔转账提议，停在执行前。
 * 数据流：Zod 校验 → proposeTransfer → ctx.body。路由不调用扣款。
 * 为什么单独成文件：提议和通过是两步人机交互，必须拆成两个 URL。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { proposeTransfer } from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

const ProposeBody = z.object({
  to: z.string().trim().min(1, "收款人不能空"),
  amount: z.coerce.number().int().positive("金额必须是正整数"),
});

export function mountProposeRoutes(router: Router): void {
  router.post("/api/propose", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/propose",
      "调用函数开始：POST /api/propose",
      "为什么写这条日志：这是人点「发起转账提议」的入口。当前：还没进核心文件。",
      { 入参: ctx.request.body, __code: "const parsed = ProposeBody.safeParse(ctx.request.body); const snapshot = proposeTransfer(parsed.data);" },
    );
    const parsed = ProposeBody.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error.issues[0]?.message ?? "入参不合法" };
      logger.error(
        "POST /api/propose",
        "调用函数结束：POST /api/propose（失败）",
        "为什么写这条日志：空收款人或非法金额是第一类失败（4xx）。当前：没写 pending。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    try {
      const snapshot = proposeTransfer(parsed.data);
      ctx.body = { ok: true, snapshot };
      logger.info(
        "POST /api/propose",
        "调用函数结束：POST /api/propose",
        "为什么写这条日志：页面要用快照证明余额未变。当前：核心已返回 waiting。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 400;
      ctx.body = { ok: false, error: message };
      logger.error(
        "POST /api/propose",
        "调用函数结束：POST /api/propose（失败）",
        "为什么写这条日志：业务拒绝也要给人看红字。当前：没有扣款。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    }
  });
}
