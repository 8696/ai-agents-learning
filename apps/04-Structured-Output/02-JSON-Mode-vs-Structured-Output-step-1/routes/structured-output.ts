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
import { logger } from "../lib/logger.js";

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
    logger.info(
      "route.structured-output",
      "POST /api/structured-output 收到请求",
      "Structured Output（语义闸）入口；记 provider / model / prompt 便于和 JSON Mode 对照同一输入下两套闸的差异",
      { provider: client.provider, model: client.modelA, prompt },
    );

    try {
      ctx.body = await runStructuredOutput(client, prompt);
    } catch (err: unknown) {
      console.error(
        `  /api/structured-output error: ${err instanceof Error ? err.message : String(err)}`,
      );
      logger.error(
        "route.structured-output",
        "runStructuredOutput threw",
        "协议 A 抛异常（网络 / 5xx / 4xx）；记 upstreamStatus + 错误信息便于排错，并返回前端",
        { mode: "json_schema_strict", err: err instanceof Error ? err.message : String(err) },
      );
      writeUpstreamError(ctx, err, { mode: "json_schema_strict" });
    }
  });
}
