/**
 * 职责：POST /api/skills/mode-full —— 全加载模式（短目录 + 10 个技能全文全加载）。
 * 数据流：校验客人那句话 → loadSkillsForMode("full", ...) → 返回轨迹。
 * 一个业务 URL 一个 route 文件（§5.7）。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { loadSkillsForMode } from "../lib/flow/skill-catalog.js";

export function mountSkillsModeFullRoutes(router: Router): void {
  router.post("/api/skills/mode-full", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: loadSkillsForMode("full", parsed.guestUtterance) };
  });
}