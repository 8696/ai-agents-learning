/**
 * 职责：POST /api/classify，校验一句用户原话后调 classifyMemory 判类。
 * 数据流：{ sentence } → Zod 校验 → classifyMemory → ctx.body。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { classifyMemory } from "../lib/flow/classify-memory.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  sentence: z.string(),
});

export function mountClassifyRoutes(router: Router): void {
  router.post("/api/classify", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 sentence 字符串。",
      });
      return;
    }
    const sentence = parsed.data.sentence.trim();
    if (!sentence) {
      sendError(ctx, 400, {
        error: "EMPTY_SENTENCE",
        explain: "这句话是空的，请输入一句用户原话再判类，比如「我们组用 Vue 3 加 TypeScript」。",
      });
      return;
    }
    if (!getLlmOptional()) {
      sendError(ctx, 503, {
        error: "NO_KEY",
        explain: "apps/.env 里当前模型服务商还没有密钥，无法判类。",
      });
      return;
    }

    const t0 = Date.now();
    logger.info(
      "调用函数-classify路由",
      "调用函数开始：classifyMemory",
      "为什么写这条日志：这一层只认 classifyMemory 的返回结果；里面那次调对话补全才是真发网络请求（看下一条「调用模型开始：对话补全」）。当前：收到一句待判类的话。",
      { 入参: { sentence }, __code: "const output = await classifyMemory(sentence);" },
    );

    try {
      const output = await classifyMemory(sentence);
      logger.info(
        "调用函数-classify路由",
        "调用函数结束：classifyMemory",
        "为什么写这条日志：要把判类结果和完整请求/响应交给页面展示。当前：判类完成，下一步写 ctx.body。",
        { 返回值: output, 耗时ms: Date.now() - t0 },
      );
      ctx.body = output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "调用函数-classify路由",
        "调用函数结束：classifyMemory（失败）",
        "为什么写这条日志：模型没能返回合法判类结果，要记下失败原因方便回查。当前：即将把 502 返回给页面。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      sendError(ctx, 502, {
        error: "CLASSIFY_FAILED",
        explain: `调用模型判类失败：${message}`,
      });
    }
  });
}
