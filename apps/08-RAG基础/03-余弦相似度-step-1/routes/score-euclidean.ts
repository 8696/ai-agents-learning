/**
 * 职责：POST /api/score-euclidean —— 只跑欧氏距离（Euclidean Distance）这一侧。
 *
 * 数据流：校验入参 → scoreVectors(metric=euclidean) → 200；ScoreInputError → 400。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { ScoreInputError, scoreVectors } from "../lib/flow/score-vectors.js";
import { jsonBody } from "../lib/http/json-body.js";
import { readScoreBody } from "../lib/http/read-score-body.js";
import { sendError } from "../lib/http/send-error.js";
import { withCall } from "../lib/log/with-call.js";

export function mountScoreEuclideanRoutes(router: Router): void {
  router.post("/api/score-euclidean", async (ctx: Context, _next: Next) => {
    const raw = jsonBody(ctx);
    try {
      const result = await withCall({
        scope: "打分-欧氏",
        name: "handleScoreEuclidean",
        explainStart:
          "为什么写这条日志：页面点了「按欧氏打分」，这一侧自己请求。当前：刚进路由。",
        explainEnd: "为什么写这条日志：右栏要看长同向有没有变远。当前：核心函数已返回。",
        入参: raw,
        __code: "readScoreBody(raw) → scoreVectors({ metric: \"euclidean\", ... })",
        fn: async () => scoreVectors({ metric: "euclidean", ...readScoreBody(raw) }),
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
