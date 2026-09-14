/**
 * 职责：GET /api/eval-set。返回 20 条评测问句 + 标注的 expectedId / 难度。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { EVAL_SET } from "../lib/corpus/eval-set.js";

export function mountEvalSet(router: Router): void {
  router.get("/api/eval-set", (ctx: Context) => {
    ctx.body = {
      ok: true,
      count: EVAL_SET.length,
      items: EVAL_SET,
    };
  });
}
