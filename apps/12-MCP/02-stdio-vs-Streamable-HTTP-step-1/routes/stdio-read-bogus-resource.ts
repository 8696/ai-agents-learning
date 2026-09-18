/**
 * 职责：POST /api/stdio/read-bogus-resource —— 故意读一个不存在的 Resource，演示业务类失败。
 * 数据流：readResource("bogus://does/not/exist") → SDK 抛 McpError → catch → ctx.body 返 ok=false
 *
 * 为什么存在：跟 call-bogus-tool 是同一类（业务错）的另一例；
 * 类 A 是网络/连接错（如 Connection closed），类 B 是协议层业务错（resource 不存在）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readResource } from "../lib/flow/stdio-client.js";

export function mountStdioReadBogusResource(router: Router): void {
  router.post("/api/stdio/read-bogus-resource", async (ctx: Context) => {
    try {
      const result = await readResource("bogus://does/not/exist");
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}