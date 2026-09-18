/**
 * 职责：POST /api/stdio/call-tool —— 触发 MCP 协议 tools/call。
 * 数据流：校验 cupSize → callTool("make_latte", {cupSize}) → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { callTool } from "../lib/flow/stdio-client.js";

const Body = z.object({
  cupSize: z.enum(["小杯", "中杯", "大杯"]),
});

export function mountStdioCallTool(router: Router): void {
  router.post("/api/stdio/call-tool", async (ctx: Context) => {
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "cupSize 必须是 小杯 / 中杯 / 大杯", issues: parsed.error.issues };
      return;
    }
    try {
      const result = await callTool("make_latte", { cupSize: parsed.data.cupSize });
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}
