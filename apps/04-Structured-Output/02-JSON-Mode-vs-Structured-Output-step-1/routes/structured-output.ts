/**
 * 职责：POST /api/structured-output —— 语义闸（json_schema + strict: true）。
 * 数据流：{ prompt } → runStructuredOutput → 与 json-mode 同形状，便于两页对照。
 * 本页教学点在 pages/structured.html。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runStructuredOutput } from "../lib/flow/run-structured.js";

export function mountStructuredOutputRoutes(router: Router): void {
  router.post("/api/structured-output", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const prompt = readPrompt(ctx);
    if (!prompt) return;

    console.log(
      `\n/api/structured-output 开始: provider=${client.provider} model=${client.modelA}`,
    );
    console.log(`  prompt: ${JSON.stringify(prompt)}`);

    try {
      ctx.body = await runStructuredOutput(client, prompt);
    } catch (err: unknown) {
      console.error(
        `  /api/structured-output error: ${err instanceof Error ? err.message : String(err)}`,
      );
      writeUpstreamError(ctx, err, { mode: "json_schema_strict" });
    }
  });
}
