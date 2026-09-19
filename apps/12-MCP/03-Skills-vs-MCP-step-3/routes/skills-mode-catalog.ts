/**
 * 职责：POST /api/skills/mode-catalog —— 仅短目录模式（10 项元数据头常驻，不加载任何技能全文）。
 * 数据流：校验客人那句话 → loadSkillsForMode("catalog-only", ...) → 返回轨迹。
 * 一个业务 URL 一个 route 文件（§5.7）。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { loadSkillsForMode } from "../lib/flow/skill-catalog.js";

export function mountSkillsModeCatalogRoutes(router: Router): void {
  router.post("/api/skills/mode-catalog", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: loadSkillsForMode("catalog-only", parsed.guestUtterance) };
  });
}