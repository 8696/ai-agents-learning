/**
 * 职责：GET /api/judge-cases —— 列出内置判定用例（不含跑分）。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { listJudgeCases } from "../lib/flow/handwritten-vs-wink.js";

export function mountJudgeCases(router: Router): void {
  router.get("/api/judge-cases", (ctx: Context) => {
    ctx.body = { ok: true, result: { cases: listJudgeCases() } };
  });
}
