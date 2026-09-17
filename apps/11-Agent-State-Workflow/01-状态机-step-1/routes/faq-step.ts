/**
 * 职责：POST /api/faq/step —— 只跑当前 FAQ 节点一次，沿边表走到下一站。
 * 数据流：校验整份 State → stepOnce → 返回转移前后 + 读/写差。完成站再点 400。
 * 为什么单独成文件：走一步是线性 FAQ 页的 HTTP 入口，不和建工单、咖啡店图混在一起。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { faqStateSchema } from "../lib/flow/faq-graph.js";
import { ClientError, stepOnce } from "../lib/flow/step-once.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  state: faqStateSchema,
});

export function mountFaqStepRoutes(router: Router): void {
  router.post("/api/faq/step", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/faq/step",
      "调用函数开始：POST /api/faq/step",
      "为什么写这条日志：线性 FAQ 页右边「走一步」打到这里。当前：准备调调度器。",
      { 入参: ctx.request.body, __code: "stepOnce(parsed.data.state)" },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体需要完整的状态（State）对象，字段要和类型一致。" };
      logger.error(
        "POST /api/faq/step",
        "调用函数结束：POST /api/faq/step（失败）",
        "为什么写这条日志：State 形状不对。当前：返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    try {
      const 返回值 = stepOnce(parsed.data.state);
      ctx.body = { ok: true, ...返回值 };
      logger.info(
        "POST /api/faq/step",
        "调用函数结束：POST /api/faq/step",
        "为什么写这条日志：一次转移已经发生。当前：把新 State 交给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        ctx.status = error.status;
        ctx.body = { ok: false, error: error.message };
        logger.error(
          "POST /api/faq/step",
          "调用函数结束：POST /api/faq/step（失败）",
          "为什么写这条日志：完成站没有出边，或边表找不到下一站。当前：返回 400。",
          { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
        );
        return;
      }
      throw error;
    }
  });
}
