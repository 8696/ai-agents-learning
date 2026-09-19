/**
 * 职责：POST /api/http/call-tool —— 调 MCP 协议 tools/call。
 * 数据流：withRequestToken → ALS 设 token → callTool(name, args) → SDK call
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { callTool } from "../lib/flow/mcp-http-client.js";
import { withRequestToken } from "./_with-token.js";

const Body = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export function mountHttpCallTool(router: Router): void {
  router.post(
    "/api/http/call-tool",
    withRequestToken(async (ctx: Context) => {
      const parsed = Body.safeParse(ctx.request.body ?? {});
      if (!parsed.success) {
        ctx.status = 400;
        ctx.body = {
          ok: false,
          error: "body 必须含 name 字段 + arguments 对象",
          issues: parsed.error.issues,
        };
        return;
      }
      const name = parsed.data.name;
      const args = parsed.data.arguments;
      try {
        const result = await callTool(name, args);
        ctx.body = { ok: true, result };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.status = 500;
        ctx.body = { ok: false, error: message };
      }
    }),
  );
}
