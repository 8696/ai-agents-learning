/**
 * 职责：POST /api/strict-rejected —— 故意发坏 schema，看 strict 在 API 入口拒不拒。
 * 数据流：无 prompt → runStrictRejected → 200+unexpectedSuccess 或 writeUpstreamError（期望 400）。
 * 本页教学点在 pages/strict-rejected.html。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runStrictRejected } from "../lib/flow/run-strict-rejected.js";

export function mountStrictRejectedRoutes(router: Router): void {
  router.post("/api/strict-rejected", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;

    console.log(
      `\n/api/strict-rejected: 故意发一个不严格 schema，让 OpenAI strict 返 400`,
    );

    try {
      ctx.body = await runStrictRejected(client);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  /api/strict-rejected 拿到预期 400: ${msg.slice(0, 300)}`);
      // 把 OpenAI 报错原文回前端——它会精确列出「哪条属性违反哪条 strict 规则」
      writeUpstreamError(ctx, err, {
        mode: "json_schema_strict",
        rejected: true,
      });
    }
  });
}
