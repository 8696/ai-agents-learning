/**
 * 职责：POST /api/retrieve，只检索 + 拼 Prompt，不调模型。
 * 数据流：{ query, topK?, disableEpisodic?, disableSemantic? } → Zod 校验 → retrieveOnly → ctx.body。
 *
 * 与 /api/ask 是不同业务（一个不调模型，一个调模型），按 §5.3.8 拆成两个 route 文件。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { retrieveOnly, DEFAULT_TOP_K } from "../lib/flow/retrieve-and-compose.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  query: z.string(),
  topK: z.number().int().positive().optional(),
  /** 关掉情景记忆：候选池里 memoryType === "情景记忆" 的条目全部排除，进 excludedPool 给页面看对照 */
  disableEpisodic: z.boolean().optional(),
  /** 关掉语义记忆：候选池里 memoryType === "语义记忆" 的条目全部排除，进 excludedPool 给页面看对照 */
  disableSemantic: z.boolean().optional(),
});

export function mountRetrieveRoutes(router: Router): void {
  router.post("/api/retrieve", async (ctx: Context) => {
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
    const topK = parsed.data.topK ?? DEFAULT_TOP_K;
    const opts = { disableEpisodic: parsed.data.disableEpisodic, disableSemantic: parsed.data.disableSemantic };

    const t0 = Date.now();
    logger.info(
      "调用函数-retrieve路由",
      "调用函数开始：retrieveOnly",
      "为什么写这条日志：这一层只认 retrieveOnly 的返回；它不调模型，只检索 + 拼 Prompt。当前：收到一句问句 + 是否关掉情景/语义记忆的开关，准备先看 Top-K 再决定要不要问模型。",
      { 入参: { query, topK, ...opts }, __code: "const output = await retrieveOnly(query, topK, opts);" },
    );

    try {
      const output = await retrieveOnly(query, topK, opts);
      logger.info(
        "调用函数-retrieve路由",
        "调用函数结束：retrieveOnly",
        "为什么写这条日志：要把候选池 + Top-K + 拼好的 Prompt + 被排除的对照池 交给页面，方便学习者核对筛出来的是不是预期、关掉类别后哪些被踢掉。当前：即将写 ctx.body。",
        { 返回值: { candidateCount: output.candidatePool.facts.length, topKSize: output.topK.length, excludedCount: output.excludedPool.facts.length, disabledMemoryTypes: output.disabledMemoryTypes }, 耗时ms: Date.now() - t0 },
      );
      ctx.body = output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "调用函数-retrieve路由",
        "调用函数结束：retrieveOnly（失败）",
        "为什么写这条日志：检索 / 拼 Prompt 失败要记下原因方便回查。当前：即将把 500 返回给页面。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      sendError(ctx, 500, {
        error: "RETRIEVE_FAILED",
        explain: `检索失败：${message}`,
      });
    }
  });
}