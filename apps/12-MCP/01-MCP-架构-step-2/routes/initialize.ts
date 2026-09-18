/**
 * 职责：POST /api/mcp/initialize。Agent 端发起能力发现。
 * 数据流：校验 JSON 对象 → exchangeMcp("initialize") → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { exchangeMcp } from "../lib/flow/exchange.js";

const Body = z
  .object({})
  .passthrough()
  .refine((value) => !Array.isArray(value), "请求体必须是对象，不能是数组");

export function mountInitialize(router: Router): void {
  router.post("/api/mcp/initialize", (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体必须是 JSON 对象", issues: parsed.error.issues };
      return;
    }
    ctx.body = exchangeMcp("initialize");
  });
}
