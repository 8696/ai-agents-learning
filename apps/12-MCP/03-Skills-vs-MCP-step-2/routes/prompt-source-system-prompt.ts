/**
 * 职责：POST /api/prompt-source/system-prompt —— 系统提示词入口。
 * 数据流：校验客人那句话 → loadPromptSource("system-prompt", ...) → 返回轨迹。
 * 一个业务 URL 一个 route 文件（§5.7）。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { loadPromptSource } from "../lib/flow/prompt-source.js";

export function mountPromptSourceSystemPromptRoutes(router: Router): void {
  router.post("/api/prompt-source/system-prompt", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: loadPromptSource("system-prompt", parsed.guestUtterance) };
  });
}