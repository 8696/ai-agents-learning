/**
 * 职责：POST /api/assembly/system-prompt-full —— system prompt 塞四册全文的对照。
 * 数据流：校验客人那句话 → runAssembly("system-prompt-full", ...) → 返回轨迹 + systemPromptChars + loadedSkills。
 * 为什么单独成文件：对照每一侧必须独立请求，禁止一个接口打包多轨迹。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseGuestUtterance } from "../lib/http/guest-body.js";
import { runAssembly } from "../lib/flow/run-assembly.js";

export function mountAssemblySystemPromptFullRoutes(router: Router): void {
  router.post("/api/assembly/system-prompt-full", (ctx: Context, _next: Next) => {
    const parsed = parseGuestUtterance(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = 400;
      ctx.body = { ok: false, error: parsed.error };
      return;
    }
    ctx.body = { ok: true, result: runAssembly("system-prompt-full", parsed.guestUtterance) };
  });
}