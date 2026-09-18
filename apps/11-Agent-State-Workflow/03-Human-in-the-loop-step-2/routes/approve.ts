/**
 * 职责：POST /api/approve —— 人点通过之后才调用扣款。
 * 数据流：Zod 校验 runId → 查过期（变体 G）→ approveTransfer → ctx.body。
 * 为什么单独成文件：和提议拆开，才不会一个按钮既提议又执行。
 *
 * 变体 G：approve 入口先查过期。已超时的单走拒绝路径，不让人通过"等那么久就给过"。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { approveTransfer, getPending, isPendingExpired } from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

const ApproveBody = z.object({
  runId: z.string().trim().min(1, "任务运行编号不能空"),
  forceFail: z.boolean().optional(),
});

export function mountApproveRoutes(router: Router): void {
  router.post("/api/approve", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/approve",
      "调用函数开始：POST /api/approve",
      "为什么写这条日志：这是人点「通过」的入口；要先查过期，避开「挂够时间就给过」。当前：还没进扣款函数。",
      { 入参: ctx.request.body, __code: "if (isPendingExpired(getPending())) 400 已超时; const snapshot = approveTransfer(runId);" },
    );
    const parsed = ApproveBody.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error.issues[0]?.message ?? "入参不合法" };
      logger.error(
        "POST /api/approve",
        "调用函数结束：POST /api/approve（失败）",
        "为什么写这条日志：缺 runId 是第一类失败（4xx）。当前：没扣款。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    // 变体 G：超时 = 拒绝。不能让人通过已过期的单。
    const pendingNow = getPending();
    if (pendingNow && isPendingExpired(pendingNow)) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "已超时，按默认拒绝收场。请重置后重新提议。" };
      logger.error(
        "POST /api/approve",
        "调用函数结束：POST /api/approve（失败）",
        "为什么写这条日志：超时后通过是变体 G 的踩坑——把审批关卡交给时钟。当前：账本未扣。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    try {
      const snapshot = approveTransfer(parsed.data.runId, parsed.data.forceFail ?? false);
      ctx.body = { ok: true, snapshot };
      logger.info(
        "POST /api/approve",
        "调用函数结束：POST /api/approve",
        "为什么写这条日志：页面对比提议后 / 通过后的次数；区分 executed / executed_failed。当前：核心已返回。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 400;
      ctx.body = { ok: false, error: message };
      logger.error(
        "POST /api/approve",
        "调用函数结束：POST /api/approve（失败）",
        "为什么写这条日志：没有待审批或编号不对时不能当已经同意。当前：账本未改。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    }
  });
}
