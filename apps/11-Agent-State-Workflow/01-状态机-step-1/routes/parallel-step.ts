/**
 * 职责：POST /api/parallel/step —— 只跑当前站一次；分流站一次跑浓缩和打奶两臂。
 * 数据流：校验 State → stepOnce → 返回转移前后 + 对象卡。
 * 为什么单独成文件：走一步是另一个业务 URL，不和建订单混在一起。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { parallelStateSchema } from "../lib/flow/parallel-graph.js";
import { ClientError, stepOnce } from "../lib/flow/parallel-step-once.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  state: parallelStateSchema,
});

export function mountParallelStepRoutes(router: Router): void {
  router.post("/api/parallel/step", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "POST /api/parallel/step",
      "调用函数开始：POST /api/parallel/step",
      "为什么写这条日志：并行页右边「走一步」打到这里。当前：准备调调度器。",
      { 入参: ctx.request.body, __code: "stepOnce(parsed.data.state)" },
    );
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体需要完整的状态（State）对象，字段要和类型一致。" };
      logger.error(
        "POST /api/parallel/step",
        "调用函数结束：POST /api/parallel/step（失败）",
        "为什么写这条日志：State 形状不对。当前：返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
      return;
    }
    try {
      const 返回值 = stepOnce(parsed.data.state);
      ctx.body = { ok: true, ...返回值 };
      logger.info(
        "POST /api/parallel/step",
        "调用函数结束：POST /api/parallel/step",
        "为什么写这条日志：一次转移已经发生。当前：把新 State 交给页面。",
        { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
      );
    } catch (error: unknown) {
      if (error instanceof ClientError) {
        ctx.status = error.status;
        ctx.body = { ok: false, error: error.message };
        logger.error(
          "POST /api/parallel/step",
          "调用函数结束：POST /api/parallel/step（失败）",
          "为什么写这条日志：完成站没有出边。当前：返回 400。",
          { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
        );
        return;
      }
      throw error;
    }
  });
}
