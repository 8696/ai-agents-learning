/**
 * 职责：POST /api/stdio/list-prompts —— 触发 MCP 协议 prompts/list。
 * 数据流：校验空 body → listPrompts() → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { listPrompts } from "../lib/flow/stdio-prompts.js";

const Body = z
  .object({})
  .passthrough()
  .refine((value) => !Array.isArray(value), "请求体必须是对象，不能是数组");

export function mountStdioListPrompts(router: Router): void {
  router.post("/api/stdio/list-prompts", async (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体必须是 JSON 对象", issues: parsed.error.issues };
      return;
    }
    const prompts = await listPrompts();
    ctx.body = { ok: true, prompts };
  });
}