/**
 * 职责：POST /api/http/connect —— 主动连远端 MCP Server（不调任何 MCP 方法）。
 * 数据流：getOrCreateClient() → 返回 status → ctx.body
 *
 * 设计意图：让"连远端"这个动作变成可观察的一步。点完能看见 sessionId + endpoint。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { getOrCreateClient, getStatus } from "../lib/flow/mcp-http-client.js";

const Body = z
  .object({})
  .passthrough()
  .refine((value) => !Array.isArray(value), "请求体必须是对象，不能是数组");

export function mountHttpConnect(router: Router): void {
  router.post("/api/http/connect", async (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "请求体必须是 JSON 对象", issues: parsed.error.issues };
      return;
    }
    try {
      await getOrCreateClient();
      const status = getStatus();
      ctx.body = { ok: true, status };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}