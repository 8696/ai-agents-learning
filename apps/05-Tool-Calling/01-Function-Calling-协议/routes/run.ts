/**
 * 职责：POST /api/run —— 单 tool / 并行多 tool（模型自己决定几个 tool_call）。
 * 数据流：{ prompt } → runToolLoop(maxRounds=4) → { mode, rounds, finalContent, … }。
 * 本页教学点在 pages/run.html 与 pages/tool-error.html（同一接口，不同 prompt）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runToolLoop } from "../lib/flow/run-tool-loop.js";
import { SYSTEM_PROMPT } from "../lib/tools/registry.js";

export function mountRunRoutes(router: Router): void {
  router.post("/api/run", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const prompt = readPrompt(ctx);
    if (!prompt) return;

    console.log(`\n/api/run 开始: provider=${client.provider} model=${client.modelA}`);
    console.log(`  prompt: ${JSON.stringify(prompt)}`);

    try {
      const out = await runToolLoop({
        llm: client,
        prompt,
        system: SYSTEM_PROMPT,
        maxRounds: 4,
      });
      ctx.body = { mode: "run", ...out };
    } catch (err: unknown) {
      console.error(`  /api/run error: ${err instanceof Error ? err.message : String(err)}`);
      writeUpstreamError(ctx, err, { mode: "run" });
    }
  });
}
