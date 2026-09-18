/**
 * 职责：POST /api/mcp/resources-read。Agent 端按 URI 读一份资源正文。
 * 数据流：校验 uri → exchangeMcp("resources/read", { uri }) → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { exchangeMcp } from "../lib/flow/exchange.js";

const Body = z.object({
  uri: z.string().min(1, "uri 不能空（咖啡店用 cafe:// 开头），例如 cafe://today-menu"),
});

export function mountResourcesRead(router: Router): void {
  router.post("/api/mcp/resources-read", (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "请求体需要 uri（咖啡店用 cafe:// 开头），例如 cafe://today-menu",
        issues: parsed.error.issues,
      };
      return;
    }
    ctx.body = exchangeMcp("resources/read", { uri: parsed.data.uri });
  });
}
