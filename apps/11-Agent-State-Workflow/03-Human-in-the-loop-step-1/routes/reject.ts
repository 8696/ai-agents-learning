/**
 * 职责：POST /api/reject —— 人点拒绝，账本和扣款函数调用次数都不动。
 * 数据流：Zod 校验 runId → rejectTransfer → ctx.body。
 * 为什么单独成文件：通过和拒绝是两种人的回法，必须拆成两个 URL，不能用 mode 字段把两种挤进同一个接口。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { rejectTransfer } from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

const RejectBody = z.object({
  runId: z.string().trim().min(1, "任务运行编号不能空"),
});

export function mountRejectRoutes(router: Router): void {
  router.post("/api/reject", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/reject",
      "调用函数开始：POST /api/reject",
      "为什么写这条日志：这是人点「拒绝」的入口。当前：还没进核心文件，扣款函数仍未进。",
      { 入参: ctx.request.body, __code: "const parsed = RejectBody.safeParse(ctx.request.body); const snapshot = rejectTransfer(parsed.data.runId);" },
    );
    const parsed = RejectBody.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error.issues[0]?.message ?? "入参不合法" };
      logger.error(
        "POST /api/reject",
        "调用函数结束：POST /api/reject（失败）",
        "为什么写这条日志：缺 runId 是第一类失败（4xx）。当前：账本未改。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    try {
      const snapshot = rejectTransfer(parsed.data.runId);
      ctx.body = { ok: true, snapshot };
      logger.info(
        "POST /api/reject",
        "调用函数结束：POST /api/reject",
        "为什么写这条日志：页面要对比拒绝前后的余额和次数，验证副作用为零。当前：核心已返回 cancelled。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 400;
      ctx.body = { ok: false, error: message };
      logger.error(
        "POST /api/reject",
        "调用函数结束：POST /api/reject（失败）",
        "为什么写这条日志：没有待审批或编号不对时不能当已经驳回。当前：账本未改。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    }
  });
}
