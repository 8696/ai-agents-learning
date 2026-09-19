/**
 * 职责：POST /api/http/connect —— 主动连远端 MCP Server（不调任何 MCP 方法）。
 * 数据流：withRequestToken 包 → ALS 设当前请求 token → getOrCreateClient()
 *         → SDK initialize 走 dynamicAuthFetch 读 ALS token 拼 Authorization 头
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { getOrCreateClient, getStatus } from "../lib/flow/mcp-http-client.js";
import { withRequestToken } from "./_with-token.js";

const Body = z
  .object({})
  .passthrough()
  .refine((value) => !Array.isArray(value), "请求体必须是对象，不能是数组");

export function mountHttpConnect(router: Router): void {
  router.post(
    "/api/http/connect",
    withRequestToken(async (ctx: Context) => {
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
    }),
  );
}
