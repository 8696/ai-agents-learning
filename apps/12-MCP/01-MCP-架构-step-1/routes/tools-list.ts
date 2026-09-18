/**
 * 职责：POST /api/mcp/tools-list。Agent 端列出工具。
 * 数据流：校验 JSON 对象 → exchangeMcp("tools/list") → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { exchangeMcp } from "../lib/flow/exchange.js";

const Body = z.record(z.unknown());

export function mountToolsList(router: Router): void {
  router.post("/api/mcp/tools-list", (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体必须是 JSON 对象", issues: parsed.error.issues };
      return;
    }
    ctx.body = exchangeMcp("tools/list");
  });
}
