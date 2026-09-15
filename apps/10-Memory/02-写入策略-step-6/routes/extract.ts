/**
 * 职责：POST /api/extract，校验一段对话原文后调 extractFacts 做结构化提取。
 * 数据流：{ text } → Zod 校验 → extractFacts → ctx.body。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { extractFacts } from "../lib/flow/extract-facts.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  text: z.string(),
});

export function mountExtractRoutes(router: Router): void {
  router.post("/api/extract", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 text 字符串。",
      });
      return;
    }
    const text = parsed.data.text.trim();
    if (!text) {
      sendError(ctx, 400, {
        error: "EMPTY_TEXT",
        explain: "这段原文是空的，请输入一段对话原文再提取，比如「我们组用 Vue 3 加 TypeScript」。",
      });
      return;
    }
    if (!getLlmOptional()) {
      sendError(ctx, 503, {
        error: "NO_KEY",
        explain: "apps/.env 里当前模型服务商还没有密钥，无法提取。",
      });
      return;
    }

    const t0 = Date.now();
    logger.info(
      "调用函数-extract路由",
      "调用函数开始：extractFacts",
      "为什么写这条日志：这一层只认 extractFacts 的返回结果；里面那次调对话补全才是真发网络请求（看下一条「调用模型开始：对话补全」）。当前：收到一段待提取的原文。",
      { 入参: { text }, __code: "const output = await extractFacts(text);" },
    );

    try {
      const output = await extractFacts(text);
      logger.info(
        "调用函数-extract路由",
        "调用函数结束：extractFacts",
        `为什么写这条日志：要把提取结果和完整请求/响应交给页面展示。当前：提取完成，抽出 ${output.candidates.length} 条候选，下一步写 ctx.body。`,
        { 返回值: output, 耗时ms: Date.now() - t0 },
      );
      ctx.body = output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "调用函数-extract路由",
        "调用函数结束：extractFacts（失败）",
        "为什么写这条日志：模型没能返回合法的候选清单，要记下失败原因方便回查。当前：即将把 502 返回给页面。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      sendError(ctx, 502, {
        error: "EXTRACT_FAILED",
        explain: `调用模型提取失败：${message}`,
      });
    }
  });
}
