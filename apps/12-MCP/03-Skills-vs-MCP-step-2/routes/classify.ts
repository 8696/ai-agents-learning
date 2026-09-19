/**
 * 职责：POST /api/classify/:scenarioId —— 分类题。校验 + 调 classify() + 返结果。
 * 一个业务 URL 一个 route 文件（§5.7）。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseClassifyBody } from "../lib/http/classify-body.js";
import { classify, type ScenarioId } from "../lib/flow/classify.js";

export function mountClassifyRoutes(router: Router): void {
  router.post("/api/classify/:scenarioId", (ctx: Context, _next: Next) => {
    const scenarioId = ctx.params.scenarioId as ScenarioId;
    const parsed = parseClassifyBody(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    try {
      const result = classify(scenarioId, parsed.optionId);
      ctx.body = { ok: true, result };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.status = 400;
      ctx.body = { ok: false, error: msg };
    }
  });
}