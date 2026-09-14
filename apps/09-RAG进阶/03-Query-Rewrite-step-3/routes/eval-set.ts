/**
 * 职责：GET /api/eval-set，返回评测集列表（不含答案），用于页面预览。
 * 数据流：EVAL_SET → 去掉 targetIds 后返回。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { EVAL_SET, validateEvalSet } from "../lib/corpus/eval-set.js";

export function mountEvalSetRoutes(router: Router): void {
  router.get("/api/eval-set", (ctx: Context, _next: Next) => {
    const validation = validateEvalSet();
    ctx.body = {
      ok: true,
      size: EVAL_SET.length,
      // 预览时去掉 targetIds（不泄答案），query + category 给页面展示
      preview: EVAL_SET.map((q) => ({ id: q.id, query: q.query, category: q.category })),
      validation,
    };
  });
}