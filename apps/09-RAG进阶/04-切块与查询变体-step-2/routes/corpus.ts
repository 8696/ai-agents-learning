/**
 * 职责：GET /api/corpus，把父子切块树交给页面先看库。
 * 数据流：读 handbook 常量 → JSON。不打分、不调模型。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { CHILDREN, PARENTS } from "../lib/corpus/handbook.js";

export function mountCorpusRoutes(router: Router): void {
  router.get("/api/corpus", (ctx: Context) => {
    ctx.body = {
      parents: PARENTS,
      children: CHILDREN,
    };
  });
}
