/**
 * 职责：POST /api/approve —— 人点通过之后才调用扣款。
 * 数据流：Zod 校验 runId → approveTransfer → ctx.body。
 * 为什么单独成文件：和提议拆开，才不会一个按钮既提议又执行。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { approveTransfer } from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

const ApproveBody = z.object({
  runId: z.string().trim().min(1, "任务运行编号不能空"),
});

export function mountApproveRoutes(router: Router): void {
  router.post("/api/approve", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/approve",
      "调用函数开始：POST /api/approve",
      "为什么写这条日志：这是人点「通过」的入口。当前：还没进扣款函数。",
      { 入参: ctx.request.body, __code: "const parsed = ApproveBody.safeParse(ctx.request.body); const snapshot = approveTransfer(parsed.data.runId);" },
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
    try {
      const snapshot = approveTransfer(parsed.data.runId);
      ctx.body = { ok: true, snapshot };
      logger.info(
        "POST /api/approve",
        "调用函数结束：POST /api/approve",
        "为什么写这条日志：页面对比提议后 / 通过后的次数。当前：核心已返回 executed。",
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
