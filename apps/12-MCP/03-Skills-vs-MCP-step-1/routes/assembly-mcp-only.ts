/**
 * 职责：POST /api/assembly/mcp-only —— 只接吧台、不加载出杯技能。
 * 数据流：校验客人那句话 → runAssembly("mcp-only") → 返回轨迹。
 * 为什么单独成文件：对照每一侧必须独立请求，禁止一个接口打包三条轨迹。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { runAssembly } from "../lib/flow/run-assembly.js";

export function mountAssemblyMcpOnlyRoutes(router: Router): void {
  router.post("/api/assembly/mcp-only", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: runAssembly("mcp-only", parsed.guestUtterance) };
  });
}
