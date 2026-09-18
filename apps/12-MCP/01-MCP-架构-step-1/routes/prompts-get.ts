/**
 * 职责：POST /api/mcp/prompts-get。Agent 端按 name + arguments 取一份提示词模板消息数组。
 * 数据流：校验 name + arguments → exchangeMcp("prompts/get", { name, arguments }) → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { exchangeMcp } from "../lib/flow/exchange.js";

const Body = z.object({
  name: z.string().min(1, "name 不能空（提示词模板的名字），例如 refund-script"),
  arguments: z.record(z.string(), z.string()).default({}),
});

export function mountPromptsGet(router: Router): void {
  router.post("/api/mcp/prompts-get", (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "请求体需要 name（如 refund-script）+ arguments（如 { orderId, reason }）",
        issues: parsed.error.issues,
      };
      return;
    }
    ctx.body = exchangeMcp("prompts/get", {
      name: parsed.data.name,
      arguments: parsed.data.arguments,
    });
  });
}