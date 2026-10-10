/**
 * 职责：GET /api/scenario，把固定场景 + 两模式各自的判据伪代码 + 入口代码交给页面。
 *
 * 数据流：直接返 FIXED_SCENARIO；不调模型、不写文件之外的副作用。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { FIXED_SCENARIO } from "../lib/flow/agents-as-tools-vs-handoff.js";

export function mountScenarioRoutes(router: Router): void {
  router.get("/api/scenario", (ctx: Context) => {
    ctx.body = { ok: true, scenario: FIXED_SCENARIO };
  });
}