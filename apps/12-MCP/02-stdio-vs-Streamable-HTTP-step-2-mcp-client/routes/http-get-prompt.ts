/**
 * 职责：POST /api/http/get-prompt —— 调 MCP 协议 prompts/get（HTTP 形态）。
 * 数据流：校验 name + arguments → getPrompt(name, args) → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { getPrompt } from "../lib/flow/mcp-http-prompts.js";

const Body = z.object({
  name: z.string().min(1, "name 不能空"),
  arguments: z.record(z.string(), z.string()).optional().default({}),
});

export function mountHttpGetPrompt(router: Router): void {
  router.post("/api/http/get-prompt", async (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "name + arguments 必填", issues: parsed.error.issues };
      return;
    }
    try {
      const result = await getPrompt(parsed.data.name, parsed.data.arguments);
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}