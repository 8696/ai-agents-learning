/**
 * 职责：POST /api/transform —— schema 不只校验，还能改结构（补 repaired / when）。
 * 数据流：{ raw } → 闸门 → Enriched.parse；不合法时 ZodError → 400。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { readJsonPayload } from "../lib/http/request-guards.js";
import { runTransform } from "../lib/schema/intent.js";

export function mountTransformRoutes(router: Router): void {
  router.post("/api/transform", (ctx: Context) => {
    const payload = readJsonPayload(ctx);
    if (payload === null) return;
    try {
      ctx.body = { value: runTransform(payload) };
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        ctx.status = 400;
        ctx.body = { error: "transform 前的校验没过", detail: error.issues };
        return;
      }
      throw error;
    }
  });
}
