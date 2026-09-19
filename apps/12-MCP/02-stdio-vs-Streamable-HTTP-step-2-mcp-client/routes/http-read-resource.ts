/**
 * 职责：POST /api/http/read-resource —— 调 MCP 协议 resources/read。
 * 数据流：withRequestToken → ALS 设 token → readResource(uri) → SDK call
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { readResource } from "../lib/flow/mcp-http-client.js";
import { withRequestToken } from "./_with-token.js";

const Body = z.object({
  uri: z.string().min(1),
});

export function mountHttpReadResource(router: Router): void {
  router.post(
    "/api/http/read-resource",
    withRequestToken(async (ctx: Context) => {
      const parsed = Body.safeParse(ctx.request.body ?? {});
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = { ok: false, error: "uri 字段必填", issues: parsed.error.issues };
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
    }),
  );
}
