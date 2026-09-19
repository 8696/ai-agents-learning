/**
 * 职责：POST /api/skills/mode-on-demand —— 按需加载模式（短目录常驻 + 命中技能加载全文）。
 * 数据流：校验客人那句话 → loadSkillsForMode("on-demand", ...) → 返回轨迹。
 * 一个业务 URL 一个 route 文件（§5.7）。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { loadSkillsForMode } from "../lib/flow/skill-catalog.js";

export function mountSkillsModeOnDemandRoutes(router: Router): void {
  router.post("/api/skills/mode-on-demand", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: loadSkillsForMode("on-demand", parsed.guestUtterance) };
  });
}