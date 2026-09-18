/**
 * 职责：POST /api/http/read-resource —— 调 MCP 协议 resources/read（HTTP 形态）。
 * 数据流：校验 uri → readResource(uri) → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { readResource } from "../lib/flow/mcp-http-client.js";

const Body = z.object({
  uri: z.string().min(1, "uri 不能空"),
});

export function mountHttpReadResource(router: Router): void {
  router.post("/api/http/read-resource", async (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "uri 不能空", issues: parsed.error.issues };
      return;
    }
    try {
      const result = await readResource(parsed.data.uri);
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}