/**
 * 职责：POST /api/score-topk —— 三把尺子共用，按本侧尺子截前 K 条（K 来自 body）。
 *
 * 数据流：校验入参 → scoreVectors({ metric, k, ...readScoreBody() }) → 200；ScoreInputError → 400。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { ScoreInputError, scoreVectors, type ScoreMetric } from "../lib/flow/score-vectors.js";
import { jsonBody } from "../lib/http/json-body.js";
import { readScoreBody } from "../lib/http/read-score-body.js";
import { sendError } from "../lib/http/send-error.js";
import { withCall } from "../lib/log/with-call.js";

const VALID_METRICS: ScoreMetric[] = ["cosine", "dot", "euclidean"];

export function mountScoreTopkRoutes(router: Router): void {
  router.post("/api/score-topk", async (ctx: Context, _next: Next) => {
    const raw = jsonBody(ctx);
    const metric = (raw && typeof raw === "object" && "metric" in raw && typeof (raw as { metric: unknown }).metric === "string")
      ? (raw as { metric: string }).metric
      : undefined;
    if (!metric || !VALID_METRICS.includes(metric as ScoreMetric)) {
      sendError(ctx, 400, { ok: false, error: `metric 必须是 cosine / dot / euclidean 之一（当前：${metric ?? "未传"}）。这是本页第二类错误：4xx。` });
      return;
    }
    try {
      const result = await withCall({
        scope: "打分-TopK",
        name: "handleScoreTopk",
        explainStart:
          "为什么写这条日志：页面点了「Top-K 截断」按钮，三侧共用这一个 endpoint，由 body.metric 决定本侧尺子。当前：刚进路由。",
        explainEnd: "为什么写这条日志：把前 K 条 + 被截掉那条按本侧尺子回给页面。当前：核心函数已返回。",
        入参: raw,
        __code: "readScoreBody(raw) → scoreVectors({ metric, k, ... })",
        fn: async () => {
          const body = readScoreBody(raw);
          if (body.k === undefined) {
            throw new ScoreInputError("Top-K 模式必须传 k（正整数）。本页默认 K = 卡片数 - 1，但请求体没带 → 仍要显式说明意图。");
          }
          return scoreVectors({ metric: metric as ScoreMetric, k: body.k, query: body.query, cards: body.cards });
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