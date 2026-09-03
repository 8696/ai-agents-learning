/**
 * 职责：POST /api/run-serial —— 串行数据依赖（先查再算），最多 5 轮。
 * 数据流：{ prompt } → runToolLoop(maxRounds=5)。与 /api/run 共用 flow，只是轮数更宽。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runToolLoop } from "../lib/flow/run-tool-loop.js";
import { SYSTEM_PROMPT } from "../lib/tools/registry.js";

export function mountRunSerialRoutes(router: Router): void {
  router.post("/api/run-serial", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const prompt = readPrompt(ctx);
    if (!prompt) return;

    console.log("\n/api/run-serial 开始");

    try {
      const out = await runToolLoop({
        llm: client,
        prompt,
        system: SYSTEM_PROMPT,
        maxRounds: 5,
      });
      ctx.body = { mode: "run-serial", ...out };
    } catch (err: unknown) {
      console.error(
        `  /api/run-serial error: ${err instanceof Error ? err.message : String(err)}`,
      );
      writeUpstreamError(ctx, err, { mode: "run-serial" });
    }
  });
}
