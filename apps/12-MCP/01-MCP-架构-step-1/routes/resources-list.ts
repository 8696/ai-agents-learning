/**
 * 职责：POST /api/mcp/resources-list。Agent 端列出资源。
 * 数据流：校验 JSON 对象 → exchangeMcp("resources/list") → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { exchangeMcp } from "../lib/flow/exchange.js";

const Body = z.record(z.unknown());

export function mountResourcesList(router: Router): void {
  router.post("/api/mcp/resources-list", (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体必须是 JSON 对象", issues: parsed.error.issues };
      return;
    }
    ctx.body = exchangeMcp("resources/list");
  });
}
