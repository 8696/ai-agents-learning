/**
 * 职责：POST /api/stdio/list-resources —— 触发 MCP 协议 resources/list。
 * 数据流：校验空 body → listResources() → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { listResources } from "../lib/flow/stdio-client.js";

const Body = z
  .object({})
  .passthrough()
  .refine((value) => !Array.isArray(value), "请求体必须是对象，不能是数组");

export function mountStdioListResources(router: Router): void {
  router.post("/api/stdio/list-resources", async (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体必须是 JSON 对象", issues: parsed.error.issues };
      return;
    }
    const resources = await listResources();
    ctx.body = { ok: true, resources };
  });
}
