/**
 * 职责：POST /api/score-cross-model —— 模拟「换嵌入模型 + 阈值重标定」。
 *       三把尺子共用一个 endpoint（body.metric 决定本侧尺子），共享 scoreVectors 核心 + scaleFactor 入参。
 *
 * 数据流：校验入参 → scoreVectors({ metric, k, threshold, scaleFactor }) → 200；ScoreInputError → 400。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { ScoreInputError, scoreVectors, type ScoreMetric } from "../lib/flow/score-vectors.js";
import { jsonBody } from "../lib/http/json-body.js";
import { readScoreBody } from "../lib/http/read-score-body.js";
import { sendError } from "../lib/http/send-error.js";
import { withCall } from "../lib/log/with-call.js";

const VALID_METRICS: ScoreMetric[] = ["cosine", "dot", "euclidean"];

export function mountScoreCrossModelRoutes(router: Router): void {
  router.post("/api/score-cross-model", async (ctx: Context, _next: Next) => {
    const raw = jsonBody(ctx);
    const metric = (raw && typeof raw === "object" && "metric" in raw && typeof (raw as { metric: unknown }).metric === "string")
      ? (raw as { metric: string }).metric
      : undefined;
    if (!metric || !VALID_METRICS.includes(metric as ScoreMetric)) {
      sendError(ctx, 400, { ok: false, error: `metric 必须是 cosine / dot / euclidean 之一（当前：${metric ?? "未传"}）。这是本页第一类错误：4xx。` });
      return;
    }
    const scaleFactorRaw = (raw && typeof raw === "object" && "scaleFactor" in raw && typeof (raw as { scaleFactor: unknown }).scaleFactor === "number")
      ? (raw as { scaleFactor: number }).scaleFactor
      : undefined;
    try {
      const result = await withCall({
        scope: "打分-跨模型",
        name: "handleScoreCrossModel",
        explainStart:
          "为什么写这条日志：页面点了「模拟换模型」按钮，三侧共用这一个 endpoint，由 body.metric 决定本侧尺子、body.scaleFactor 决定分数尺度模拟。当前：刚进路由。",
        explainEnd: "为什么写这条日志：把换模型后的前 K 条 + 弃权判定 + 阈值 + maxScore 按本侧尺子回给页面。当前：核心函数已返回。",
        入参: raw,
        __code: "readScoreBody(raw) → scoreVectors({ metric, k, threshold, scaleFactor, ... })",
        fn: async () => {
          const body = readScoreBody(raw);
          const k = body.k ?? 3;
          const threshold = body.threshold ?? 0.5;
          return scoreVectors({
            metric: metric as ScoreMetric,
            k,
            threshold,
            scaleFactor: scaleFactorRaw,
            query: body.query,
            cards: body.cards,
          });
        },
      });
      ctx.body = result;
    } catch (error: unknown) {
      if (error instanceof ScoreInputError) {
        sendError(ctx, error.httpStatus, { ok: false, error: error.message });
        return;
      }
      throw error;
    }
  });
}