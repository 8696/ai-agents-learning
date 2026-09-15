/**
 * 职责：POST /api/filter-dimensions，接收一段对话原文 + 阈值 + 维度开关，
 *       走四道闸门：extractFacts → filterByConfidence → filterByContentDimensions。
 * 数据流：{ text, threshold, enableA, enableB, enableC }
 *   → Zod 校验 → extractFacts → filterByConfidence → filterByContentDimensions → ctx.body。
 *
 * 闸门顺序：① 提取（拿到 0~N 条候选）→ ② 置信度阈值（数值判定，过不去标 BELOW_THRESHOLD）
 *         → ③ 内容维度 A/B/C（语义判定，过不去标 PROGRAMMATIC_RULE / SESSION_ONLY / PUBLIC_KNOWLEDGE）
 *
 * 本步保留 step-1 的 /api/extract + step-2 的 /api/filter 作前几步的对照基线。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { extractFacts } from "../lib/flow/extract-facts.js";
import { filterByConfidence, type FilterVerdict } from "../lib/flow/filter-by-confidence.js";
import { filterByContentDimensions } from "../lib/flow/filter-by-content-dimensions.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  text: z.string(),
  threshold: z.number().min(0).max(1),
  enableA: z.boolean(),
  enableB: z.boolean(),
  enableC: z.boolean(),
});

export interface FilterDimensionsResponse {
  text: string;
  threshold: number;
  enableA: boolean;
  enableB: boolean;
  enableC: boolean;
  todayBjt: string;
  /** 四道闸门后仍能进库的候选 */
  passed: FilterVerdict[];
  /** 第一道闸门（置信度）拦下的候选 */
  rejectedByThreshold: FilterVerdict[];
  /** 第三道闸门（维度 A / B / C）拦下的候选 */
  rejectedByDimension: FilterVerdict[];
  /** 原始条数 */
  originalCount: number;
  /** extractFacts 的请求 / 响应（来自第一道闸门） */
  modelRequest: unknown;
  modelResponse: unknown;
  /** filterByContentDimensions 的请求 / 响应（来自第三道闸门；三道维度都关时为 null） */
  dimensionsRequest: unknown;
  dimensionsResponse: unknown;
  durationMs: number;
}

export function mountFilterDimensionsRoutes(router: Router): void {
  router.post("/api/filter-dimensions", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 text 字符串 + threshold 数字（0~1）+ enableA / enableB / enableC 布尔。",
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

    const { threshold, enableA, enableB, enableC } = parsed.data;
    const t0 = Date.now();

    logger.info(
      "调用函数-filter-dimensions路由",
      "调用函数开始：filter-dimensions",
      `为什么写这条日志：这一层调三道闸门（提取 + 置信度 + 内容维度 A/B/C）；真发网络请求的有两次（提取 + 维度判定，分别看子调用）。当前：收到原文 + threshold=${threshold} + enableA=${enableA} + enableB=${enableB} + enableC=${enableC}。`,
      { 入参: { text, threshold, enableA, enableB, enableC }, __code: "const output = await filterDimensions(text, threshold, enableA, enableB, enableC);" },
    );

    try {
      // ① 提取
      const extracted = await extractFacts(text);
      // ② 置信度阈值
      const thresholdResult = filterByConfidence(extracted.candidates, threshold);
      // ③ 内容维度 A / B / C（只对过置信度的候选做维度判定；置信度已被拦下的不再判）
      const dimensionsResult = await filterByContentDimensions({
        candidates: thresholdResult.passed,
        toggle: { enableA, enableB, enableC },
      });

      const durationMs = Date.now() - t0;
      const output: FilterDimensionsResponse = {
        text: extracted.text,
        threshold,
        enableA,
        enableB,
        enableC,
        todayBjt: extracted.todayBjt,
        passed: dimensionsResult.verdicts.filter((v) => v.passed),
        rejectedByThreshold: thresholdResult.rejected,
        rejectedByDimension: dimensionsResult.verdicts.filter((v) => !v.passed),
        originalCount: thresholdResult.originalCount,
        modelRequest: extracted.modelRequest,
        modelResponse: extracted.modelResponse,
        dimensionsRequest: dimensionsResult.modelRequest,
        dimensionsResponse: dimensionsResult.modelResponse,
        durationMs,
      };

      logger.info(
        "调用函数-filter-dimensions路由",
        "调用函数结束：filter-dimensions",
        `为什么写这条日志：要把四道闸门的结果和完整请求 / 响应交给页面展示。当前：把关完成，通过 ${output.passed.length} / 置信度拦下 ${output.rejectedByThreshold.length} / 维度拦下 ${output.rejectedByDimension.length}。`,
        { 返回值: output, 耗时ms: durationMs },
      );
      ctx.body = output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        "调用函数-filter-dimensions路由",
        "调用函数结束：filter-dimensions（失败）",
        "为什么写这条日志：把关失败要记下原因方便回查，可能是提取阶段模型返回不合法，也可能是维度判定阶段。当前：即将把 502 返回给页面。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      sendError(ctx, 502, {
        error: "FILTER_DIMENSIONS_FAILED",
        explain: `把关失败：${message}`,
      });
    }
  });
}
