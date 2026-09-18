/**
 * 职责：POST /api/mcp/tools-call。Agent 端调用工具，真去做一杯拿铁。
 * 数据流：校验 cupSize → exchangeMcp("tools/call") → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { exchangeMcp } from "../lib/flow/exchange.js";

const Body = z.object({
  cupSize: z.string().min(1, "杯型不能空"),
});

export function mountToolsCall(router: Router): void {
  router.post("/api/mcp/tools-call", (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体需要 cupSize（杯型），例如 中杯", issues: parsed.error.issues };
      return;
    }
    ctx.body = exchangeMcp("tools/call", {
      name: "make_latte",
      arguments: { cupSize: parsed.data.cupSize },
    });
  });
}
