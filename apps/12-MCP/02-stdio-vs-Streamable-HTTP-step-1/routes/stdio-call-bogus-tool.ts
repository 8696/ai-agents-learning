/**
 * 职责：POST /api/stdio/call-bogus-tool —— 故意调一个不存在的 Tool，演示业务类失败。
 * 数据流：callTool("non_existent_tool", {}) → SDK 抛 McpError → catch → ctx.body 返 ok=false
 *
 * 为什么存在：这是 §5.3.2 #2 错误处理「第二类」（业务错误）的入口；
 * 类 A 是网络/连接错（如 Connection closed），类 B 是协议层业务错（tool 不存在）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { callTool } from "../lib/flow/stdio-client.js";

export function mountStdioCallBogusTool(router: Router): void {
  router.post("/api/stdio/call-bogus-tool", async (ctx: Context) => {
    try {
      const result = await callTool("non_existent_tool", {});
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}