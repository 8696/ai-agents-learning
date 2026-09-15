/**
 * 职责：POST /api/filter，接收一段对话原文 + 阈值，调 extractFacts 做提取、再调 filterByConfidence 做把关判定。
 * 数据流：{ text, threshold } → Zod 校验 → extractFacts → filterByConfidence → ctx.body。
 *
 * 本步在 step-1 之上加了一个 /api/filter 端点（不改 step-1 的 /api/extract）。
 * 「只提取 / 不把关」的对照基线仍在 step-1 那一侧供学习者对比。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { extractFacts } from "../lib/flow/extract-facts.js";
import { filterByConfidence, type FilterVerdict } from "../lib/flow/filter-by-confidence.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  text: z.string(),
  threshold: z.number().min(0).max(1),
});

export interface FilterResponse {
  text: string;
  threshold: number;
  todayBjt: string;
  /** 通过置信度阈值、能进库的候选（passed === true） */
  passed: FilterVerdict[];
  /** 被拦下的候选（passed === false + rejectReason） */
  rejected: FilterVerdict[];
  originalCount: number;
  modelRequest: unknown;
  modelResponse: unknown;
  durationMs: number;
}

export function mountFilterRoutes(router: Router): void {
  router.post("/api/filter", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 text 字符串 + threshold 数字（0~1）。",
      });
      return;
    }
    const text = parsed.data.text.trim();
    if (!text) {
      sendError(ctx, 400, {
        error: "EMPTY_TEXT",
        explain: "这段原文是空的，请输入一段对话原文再把关。",
      });
      return;
    }
    if (!getLlmOptional()) {
      sendError(ctx, 503, {
        error: "NO_KEY",
        explain: "apps/.env 里当前模型服务商还没有密钥，无法把关。",
      });
      return;
    }

    const threshold = parsed.data.threshold;
    const t0 = Date.now();

    logger.info(
      "调用函数-filter路由",
      "调用函数开始：filter",
      `为什么写这条日志：这一层只调 extractFacts + filterByConfidence 两个函数；提取那次调对话补全才是真发网络请求（看「调用模型开始：对话补全」）。当前：收到一段原文 + 阈值 ${threshold}。`,
      { 入参: { text, threshold }, __code: "const output = await filter(text, threshold);" },
    );

    try {
      // 1) 提取：拿到候选清单（0~N 条，N 由模型决定）
      const extracted = await extractFacts(text);
      // 2) 把关：按置信度阈值逐条判定
      const filterResult = filterByConfidence(extracted.candidates, threshold);
      const durationMs = Date.now() - t0;

      const output: FilterResponse = {
        text: extracted.text,
        threshold,
        todayBjt: extracted.todayBjt,
        passed: filterResult.passed,
        rejected: filterResult.rejected,
        originalCount: filterResult.originalCount,
        modelRequest: extracted.modelRequest,
        modelResponse: extracted.modelResponse,
        durationMs,
      };

      logger.info(
        "调用函数-filter路由",
        "调用函数结束：filter",
        `为什么写这条日志：要把把关结果和完整请求/响应交给页面展示。当前：把关完成，${filterResult.passed.length} 条通过 / ${filterResult.rejected.length} 条被拦下，下一步写 ctx.body。`,
        { 返回值: output, 耗时ms: durationMs },
      );
      ctx.body = output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "调用函数-filter路由",
        "调用函数结束：filter（失败）",
        "为什么写这条日志：把关失败要记下原因方便回查，可能是提取阶段模型返回不合法，也可能是阈值传错。当前：即将把 502 返回给页面。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      sendError(ctx, 502, {
        error: "FILTER_FAILED",
        explain: `把关失败：${message}`,
      });
    }
  });
}
