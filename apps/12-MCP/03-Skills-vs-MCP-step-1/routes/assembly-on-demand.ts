/**
 * 职责：POST /api/assembly/on-demand —— system prompt 只带 AGENTS.md + 技能目录，按 utterance 命中加载。
 * 数据流：校验客人那句话 → runAssembly("on-demand", ...) → 返回轨迹 + systemPromptChars + loadedSkills。
 * 为什么单独成文件：对照每一侧必须独立请求。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { runAssembly } from "../lib/flow/run-assembly.js";

export function mountAssemblyOnDemandRoutes(router: Router): void {
  router.post("/api/assembly/on-demand", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: runAssembly("on-demand", parsed.guestUtterance) };
  });
}