/**
 * 职责：POST /api/score-normalize —— 归一化（normalize）开关对照。
 *       三把尺子共用一个 endpoint（body.metric 决定本侧尺子），共享 scoreVectors 核心 + normalize 入参。
 *
 * 数据流：校验入参 → scoreVectors({ metric, normalize, k, threshold }) → 200；ScoreInputError → 400。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { ScoreInputError, scoreVectors, type ScoreMetric } from "../lib/flow/score-vectors.js";
import { jsonBody } from "../lib/http/json-body.js";
import { readScoreBody } from "../lib/http/read-score-body.js";
import { sendError } from "../lib/http/send-error.js";
import { withCall } from "../lib/log/with-call.js";

const VALID_METRICS: ScoreMetric[] = ["cosine", "dot", "euclidean"];

export function mountScoreNormalizeRoutes(router: Router): void {
  router.post("/api/score-normalize", async (ctx: Context, _next: Next) => {
    const raw = jsonBody(ctx);
    const metric = (raw && typeof raw === "object" && "metric" in raw && typeof (raw as { metric: unknown }).metric === "string")
      ? (raw as { metric: string }).metric
      : undefined;
    if (!metric || !VALID_METRICS.includes(metric as ScoreMetric)) {
      sendError(ctx, 400, { ok: false, error: `metric 必须是 cosine / dot / euclidean 之一（当前：${metric ?? "未传"}）。这是本页第一类错误：4xx。` });
      return;
    }
    const normalizeRaw = (raw && typeof raw === "object" && "normalize" in raw && typeof (raw as { normalize: unknown }).normalize === "boolean")
      ? (raw as { normalize: boolean }).normalize
      : undefined;
    try {
      const result = await withCall({
        scope: "打分-归一化",
        name: "handleScoreNormalize",
        explainStart:
          "为什么写这条日志：页面点了「归一化开关」按钮，三侧共用这一个 endpoint，由 body.metric 决定本侧尺子、body.normalize 决定是否 L2 归一化。当前：刚进路由。",
        explainEnd: "为什么写这条日志：把归一化开关后的前 K 条 + 弃权判定按本侧尺子回给页面。当前：核心函数已返回。",
        入参: raw,
        __code: "readScoreBody(raw) → scoreVectors({ metric, normalize, ... })",
        fn: async () => {
          const body = readScoreBody(raw);
          return scoreVectors({
            metric: metric as ScoreMetric,
            normalize: normalizeRaw,
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