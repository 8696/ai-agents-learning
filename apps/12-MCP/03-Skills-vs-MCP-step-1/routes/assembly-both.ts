/**
 * 职责：POST /api/assembly/both —— 吧台加出杯技能。
 * 数据流：校验客人那句话 → runAssembly("both") → 返回轨迹。
 * 为什么单独成文件：对照每一侧必须独立请求。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { runAssembly } from "../lib/flow/run-assembly.js";

export function mountAssemblyBothRoutes(router: Router): void {
  router.post("/api/assembly/both", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: runAssembly("both", parsed.guestUtterance) };
  });
}
