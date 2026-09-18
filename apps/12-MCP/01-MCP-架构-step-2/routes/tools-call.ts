/**
 * 职责：POST /api/mcp/tools-call。Agent 端调用 create_ticket，真建一张退款工单。
 * 数据流：校验 name=create_ticket + arguments{orderId, reason} → exchangeMcp("tools/call") → ctx.body
 *
 * step-2 的对照页只调 create_ticket（同一轮退款建工单）；make_latte 是 step-1 的咖啡店场景，本步不需要。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { exchangeMcp } from "../lib/flow/exchange.js";

const Body = z.object({
  name: z.literal("create_ticket"),
  arguments: z.object({
    orderId: z.string().min(1, "订单号不能空，例如 A-1001"),
    reason: z.string().min(1, "退款原因不能空，例如 七天无理由"),
  }),
});

export function mountToolsCall(router: Router): void {
  router.post("/api/mcp/tools-call", (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "请求体需要 name: 'create_ticket' + arguments: { orderId, reason }（建工单的入参）",
        issues: parsed.error.issues,
      };
      return;
    }
    ctx.body = exchangeMcp("tools/call", {
      name: "create_ticket",
      arguments: {
        orderId: parsed.data.arguments.orderId,
        reason: parsed.data.arguments.reason,
      },
    });
  });
}