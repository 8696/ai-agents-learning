/**
 * 职责：POST /api/edit —— 改 pending.args（收款人 / 金额），不改 status、不调 executeTransfer。
 * 数据流：Zod 校验入参 → editTransferPending → ctx.body。
 * 为什么单独成文件：通过 / 拒绝 / 改参数是三种不同的「修正」，必须拆成三个 URL，不能用 mode 字段挤进同一个接口。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { editTransferPending } from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

const EditBody = z.object({
  runId: z.string().trim().min(1, "任务运行编号不能空"),
  to: z.string().trim().min(1, "收款人不能空"),
  amount: z.coerce.number().int().positive("金额必须是正整数"),
});

export function mountEditRoutes(router: Router): void {
  router.post("/api/edit", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/edit",
      "调用函数开始：POST /api/edit",
      "为什么写这条日志：这是人点「保存修改」的入口，必须保证 status 仍是 waiting、executeTransfer 不进。当前：还没进核心文件。",
      { 入参: ctx.request.body, __code: "const parsed = EditBody.safeParse(ctx.request.body); const snapshot = editTransferPending(parsed.data.runId, parsed.data);" },
    );
    const parsed = EditBody.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error.issues[0]?.message ?? "入参不合法" };
      logger.error(
        "POST /api/edit",
        "调用函数结束：POST /api/edit（失败）",
        "为什么写这条日志：缺 runId / 空收款人 / 非法金额是第一类失败（4xx）。当前：pending 未改。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    try {
      const snapshot = editTransferPending(parsed.data.runId, {
        to: parsed.data.to,
        amount: parsed.data.amount,
      });
      ctx.body = { ok: true, snapshot };
      logger.info(
        "POST /api/edit",
        "调用函数结束：POST /api/edit",
        "为什么写这条日志：页面要把改后的 args 摊开，证明「改参数 ≠ 批准」。当前：核心已返回 waiting + 新 args。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 400;
      ctx.body = { ok: false, error: message };
      logger.error(
        "POST /api/edit",
        "调用函数结束：POST /api/edit（失败）",
        "为什么写这条日志：没有待审批或编号不对时不能当已经改完。当前：pending 未改。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    }
  });
}
