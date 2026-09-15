/**
 * 职责：POST /api/filter-dimensions，接收一段对话原文 + 两个分档阈值 + 维度开关，
 *       走六道闸门：extractFacts → filterByConfidence → filterByContentDimensions → splitByConfidence。
 * 数据流：{ text, midThreshold, highThreshold, enableA, enableB, enableC, enablePii }
 *   → Zod 校验 → extractFacts → filterByConfidence → filterByContentDimensions → splitByConfidence → ctx.body。
 *
 * 闸门顺序：
 *   ① 提取（拿到 0~N 条候选）
 *   ② 置信度阈值（数值判定，按 midThreshold 过滤；达不到标 BELOW_THRESHOLD）
 *   ③ 内容维度 A / B / C / PII（语义判定，不过标 PROGRAMMATIC_RULE / SESSION_ONLY / PUBLIC_KNOWLEDGE / PII_DETECTED）
 *   ④ 分档（按 highThreshold 把过了所有维度的候选分两堆：高档自动通过 / 中档进 pendingConfirmation）
 *
 * 本步保留 step-1 的 /api/extract + step-2 的 /api/filter 作前几步的对照基线。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { extractFacts } from "../lib/flow/extract-facts.js";
import { filterByConfidence, type FilterVerdict } from "../lib/flow/filter-by-confidence.js";
import { filterByContentDimensions } from "../lib/flow/filter-by-content-dimensions.js";
import { splitByConfidence, makePendingId } from "../lib/flow/split-by-confidence.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";
import { logger } from "../lib/logger.js";
import { addToPendingStore } from "./confirm.js";

const BodySchema = z.object({
  text: z.string(),
  midThreshold: z.number().min(0).max(1),
  highThreshold: z.number().min(0).max(1),
  enableA: z.boolean(),
  enableB: z.boolean(),
  enableC: z.boolean(),
  enablePii: z.boolean(),
});

export interface PendingEntryResponse {
  id: string;
  text: string;
  key: string;
  value: string;
  type: string;
  confidence: number;
  highThreshold: number;
  midThreshold: number;
  /** 服务端写入 pendingStore 的时间戳；前端可忽略 */
  createdAt: number;
}

export interface FilterDimensionsResponse {
  text: string;
  midThreshold: number;
  highThreshold: number;
  enableA: boolean;
  enableB: boolean;
  enableC: boolean;
  enablePii: boolean;
  todayBjt: string;
  /** 高档自动通过：conf >= highThreshold 且过了所有维度，能写进库 */
  passed: FilterVerdict[];
  /** 中档待确认：midThreshold <= conf < highThreshold，等用户点 [记住] / [不用] */
  pendingConfirmation: PendingEntryResponse[];
  /** 第一道闸门（置信度）拦下的候选 */
  rejectedByThreshold: FilterVerdict[];
  /** 第三道闸门（维度 A / B / C / PII）拦下的候选 */
  rejectedByDimension: FilterVerdict[];
  /** 原始条数 */
  originalCount: number;
  /** extractFacts 的请求 / 响应（来自第一道闸门） */
  modelRequest: unknown;
  modelResponse: unknown;
  /** filterByContentDimensions 的请求 / 响应（来自第三道闸门；四道维度都关时为 null） */
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
        explain: "请求体要有 text 字符串 + midThreshold 数字（0~1）+ highThreshold 数字（0~1，且 ≥ midThreshold）+ enableA/B/C/Pii 布尔。",
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

    const { midThreshold, highThreshold, enableA, enableB, enableC, enablePii } = parsed.data;
    if (midThreshold > highThreshold) {
      sendError(ctx, 400, {
        error: "BAD_THRESHOLD",
        explain: `midThreshold (${midThreshold}) 不能大于 highThreshold (${highThreshold})。`,
      });
      return;
    }

    const t0 = Date.now();

    logger.info(
      "调用函数-filter-dimensions路由",
      "调用函数开始：filter-dimensions",
      `为什么写这条日志：这一层调四道闸门（提取 + 置信度 + 内容维度 A/B/C/PII + 分档）；真发网络请求的有两次（提取 + 维度判定，分别看子调用）。当前：收到原文 + midThreshold=${midThreshold} + highThreshold=${highThreshold} + enableA=${enableA} + enableB=${enableB} + enableC=${enableC} + enablePii=${enablePii}。`,
      { 入参: { text, midThreshold, highThreshold, enableA, enableB, enableC, enablePii }, __code: "const output = await filterDimensions(text, midThreshold, highThreshold, enableA, enableB, enableC, enablePii);" },
    );

    try {
      // ① 提取
      const extracted = await extractFacts(text);
      // ② 置信度阈值（用 midThreshold 过滤，跟 step-2 的 threshold 同义）
      const thresholdResult = filterByConfidence(extracted.candidates, midThreshold);
      // ③ 内容维度 A / B / C / PII（只对过置信度的候选做维度判定；置信度已被拦下的不再判）
      const dimensionsResult = await filterByContentDimensions({
        candidates: thresholdResult.passed,
        toggle: { enableA, enableB, enableC, enablePii },
      });
      // ④ 分档：把过了所有维度的候选按 highThreshold / midThreshold 分三档
      const splitResult = splitByConfidence(dimensionsResult.verdicts, {
        highThreshold,
        midThreshold,
      });

      const durationMs = Date.now() - t0;
      // 中档候选项写进 pendingStore（内存数组；每条带 id 给前端 [记住] / [不用] 用）
      const createdAt = Date.now();
      const pendingEntries = splitResult.pending.map((v, idx) => {
        const entry = {
          id: makePendingId(v, createdAt, idx),
          text,
          key: v.candidate.key,
          value: v.candidate.value,
          type: v.candidate.type,
          confidence: v.candidate.confidence,
          highThreshold,
          midThreshold,
          createdAt,
        };
        return entry;
      });
      addToPendingStore(pendingEntries);

      const output: FilterDimensionsResponse = {
        text: extracted.text,
        midThreshold,
        highThreshold,
        enableA,
        enableB,
        enableC,
        enablePii,
        todayBjt: extracted.todayBjt,
        passed: splitResult.passed,
        pendingConfirmation: pendingEntries,
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
        `为什么写这条日志：要把六道闸门的结果 + 中档待确认池交给页面展示。当前：把关完成，高档自动通过 ${output.passed.length} / 中档待确认 ${output.pendingConfirmation.length} / 置信度拦下 ${output.rejectedByThreshold.length} / 维度拦下 ${output.rejectedByDimension.length}。`,
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