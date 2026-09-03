/**
 * 职责：POST /api/text —— 协议 B 无 tools（类 JSON Mode，语法闸弱对应）。
 * 数据流：{ prompt } → runTextNoTools → { mode: text_no_tools, raw, parsed, analysis }。
 * 本页教学点在 pages/text.html。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runTextNoTools } from "../lib/flow/run-text.js";

export function mountTextRoutes(router: Router): void {
  router.post("/api/text", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const prompt = readPrompt(ctx);
    if (!prompt) return;

    console.log(
      `\n/api/text 开始: provider=${client.provider} model=${client.modelB}`,
    );
    console.log(`  prompt: ${JSON.stringify(prompt)}`);

    try {
      ctx.body = await runTextNoTools(client, prompt);
    } catch (err: unknown) {
      console.error(
        `  /api/text error: ${err instanceof Error ? err.message : String(err)}`,
      );
      writeUpstreamError(ctx, err, { mode: "text_no_tools" });
    }
  });
}
