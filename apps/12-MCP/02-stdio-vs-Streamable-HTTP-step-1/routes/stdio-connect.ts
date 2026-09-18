/**
 * 职责：POST /api/stdio/connect —— 主动 connect stdio MCP Client（不调任何方法）。
 * 数据流：getOrCreateClient() → 返回 status → ctx.body
 *
 * 设计意图：让"启动子进程"这个动作变成可观察的一步。点完能看见 pid + startedAt。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { getOrCreateClient, getStatus } from "../lib/flow/stdio-client.js";

const Body = z
  .object({})
  .passthrough()
  .refine((value) => !Array.isArray(value), "请求体必须是对象，不能是数组");

export function mountStdioConnect(router: Router): void {
  router.post("/api/stdio/connect", async (ctx: Context) => {
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
