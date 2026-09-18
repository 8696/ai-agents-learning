/**
 * 职责：POST /api/http/list-prompts —— 调 MCP 协议 prompts/list（HTTP 形态）。
 * 数据流：校验空 body → listPrompts() → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { listPrompts } from "../lib/flow/mcp-http-prompts.js";

const Body = z
  .object({})
  .passthrough()
  .refine((value) => !Array.isArray(value), "请求体必须是对象，不能是数组");

export function mountHttpListPrompts(router: Router): void {
  router.post("/api/http/list-prompts", async (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体必须是 JSON 对象", issues: parsed.error.issues };
      return;
    }
    try {
      const prompts = await listPrompts();
      ctx.body = { ok: true, prompts };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}