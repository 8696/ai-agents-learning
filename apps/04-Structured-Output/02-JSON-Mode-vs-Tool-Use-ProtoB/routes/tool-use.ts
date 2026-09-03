/**
 * 职责：POST /api/tool-use —— 协议 B 强制 tool_choice（类 Structured Output）。
 * 数据流：{ prompt } → runToolUseForced → input 已是对象 + Zod。
 * 本页教学点在 pages/tool-use.html。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runToolUseForced } from "../lib/flow/run-tool-use.js";

export function mountToolUseRoutes(router: Router): void {
  router.post("/api/tool-use", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const prompt = readPrompt(ctx);
    if (!prompt) return;

    console.log(
      `\n/api/tool-use 开始: provider=${client.provider} model=${client.modelB}`,
    );
    console.log(`  prompt: ${JSON.stringify(prompt)}`);

    try {
      ctx.body = await runToolUseForced(client, prompt);
    } catch (err: unknown) {
      console.error(
        `  /api/tool-use error: ${err instanceof Error ? err.message : String(err)}`,
      );
      writeUpstreamError(ctx, err, { mode: "tool_use_forced" });
    }
  });
}
