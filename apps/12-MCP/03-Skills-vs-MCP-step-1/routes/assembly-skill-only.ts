/**
 * 职责：POST /api/assembly/skill-only —— 只读出杯技能、不接吧台。
 * 数据流：校验客人那句话 → runAssembly("skill-only") → 返回轨迹。
 * 为什么单独成文件：对照每一侧必须独立请求。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { runAssembly } from "../lib/flow/run-assembly.js";

export function mountAssemblySkillOnlyRoutes(router: Router): void {
  router.post("/api/assembly/skill-only", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: runAssembly("skill-only", parsed.guestUtterance) };
  });
}
