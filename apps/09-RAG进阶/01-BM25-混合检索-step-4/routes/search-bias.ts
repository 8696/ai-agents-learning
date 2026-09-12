/**
 * 职责：POST /api/search-bias。校验入参后调 detectAlpha，写 ctx.body。
 * 数据流：{ question } → detectAlpha → AlphaBias
 *
 * 这是「按问句偏置 α」端点：纯本地规则，不调嵌入 / 不调网络（detectAlpha 内调用仍是函数层级日志）。
 */
import Router from "@koa/router";
import { z } from "zod";
import { detectAlpha } from "../lib/flow/alpha-bias.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  question: z.string().min(1, "question 不能为空"),
});

export function mountSearchBias(router: Router): void {
  router.post("/api/search-bias", async (ctx) => {
    const started = Date.now();
    logger.info(
      "search-bias",
      "调用函数开始：POST /api/search-bias",
      "提问入口。里面是纯本地正则检测，不调网络。",
      { 入参: jsonBody(ctx), __code: "detectAlpha({ question })" },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体不是 { question: string }", "检查 JSON");
      }
      const result = await detectAlpha({ query: parsed.data.question });
      logger.info(
        "search-bias",
        "调用函数结束：POST /api/search-bias",
        "按问句偏置结果已出；前端将展示「检测到的分类 + 建议 α + 触发原因」。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "search-bias",
        "调用函数结束：POST /api/search-bias（失败）",
        error instanceof HttpError ? error.hint : "偏置检测失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}