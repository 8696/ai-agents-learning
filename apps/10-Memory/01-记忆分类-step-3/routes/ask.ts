/**
 * 职责：POST /api/ask，检索 + 拼 Prompt + 调大模型；返回完整候选池 / Top-K / 拼好的 Prompt / 模型请求 / 模型响应 / 最终回答。
 * 数据流：{ query, topK?, disableEpisodic?, disableSemantic? } → Zod 校验 → getLlmOptional 兜底 → askWithRetrieval → ctx.body。
 *
 * 与 /api/retrieve 是不同业务（这条真调模型），按 §5.3.8 拆成两个 route 文件。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { askWithRetrieval, DEFAULT_TOP_K } from "../lib/flow/retrieve-and-ask.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  query: z.string(),
  topK: z.number().int().positive().optional(),
  /** 关掉情景记忆：候选池里 memoryType === "情景记忆" 的条目全部排除 */
  disableEpisodic: z.boolean().optional(),
  /** 关掉语义记忆：候选池里 memoryType === "语义记忆" 的条目全部排除 */
  disableSemantic: z.boolean().optional(),
});

export function mountAskRoutes(router: Router): void {
  router.post("/api/ask", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 query 字符串。",
      });
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, {
        error: "EMPTY_QUERY",
        explain: "问句是空的，请输入一句你要问的话，比如「我平时用什么框架」。",
      });
      return;
    }
    if (!getLlmOptional()) {
      sendError(ctx, 503, {
        error: "NO_KEY",
        explain: "apps/.env 里当前模型服务商还没有密钥，无法调模型回答。可以先点「只检索不调模型」看候选池 / Top-K / 拼好的 Prompt。",
      });
      return;
    }

    const topK = parsed.data.topK ?? DEFAULT_TOP_K;
    const opts = { disableEpisodic: parsed.data.disableEpisodic, disableSemantic: parsed.data.disableSemantic };
    const t0 = Date.now();
    logger.info(
      "调用函数-ask路由",
      "调用函数开始：askWithRetrieval",
      "为什么写这条日志：这一层只认 askWithRetrieval 的返回；里面那次调对话补全才是真发网络请求（看下一条「调用模型开始：对话补全」）。当前：收到一句问句 + 关掉类别的开关，准备走完整检索 + 拼 Prompt + 调模型链路。",
      { 入参: { query, topK, ...opts }, __code: "const output = await askWithRetrieval(query, topK, opts);" },
    );

    try {
      const output = await askWithRetrieval(query, topK, opts);
      logger.info(
        "调用函数-ask路由",
        "调用函数结束：askWithRetrieval",
        "为什么写这条日志：要把候选池 / Top-K / 拼好的 Prompt / 完整模型请求 / 完整模型响应 / 最终回答 + 排除对照一起交给页面展示。当前：即将写 ctx.body。",
        { 返回值: { candidateCount: output.candidatePool.facts.length, topKSize: output.topK.length, excludedCount: output.excludedPool.facts.length, disabledMemoryTypes: output.disabledMemoryTypes, answerPreview: output.modelAnswer.slice(0, 80) }, 耗时ms: Date.now() - t0 },
      );
      ctx.body = output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "调用函数-ask路由",
        "调用函数结束：askWithRetrieval（失败）",
        "为什么写这条日志：模型没能基于筛出的事实给出回答，要记下原因方便回查。当前：即将把 502 返回给页面。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      sendError(ctx, 502, {
        error: "ASK_FAILED",
        explain: `检索 + 调模型失败：${message}`,
      });
    }
  });
}