/**
 * 职责：POST /api/json-mode —— 语法闸（response_format: json_object）。
 * 数据流：{ prompt } → runJsonMode → { mode, raw, parsed, analysis, … }。
 * 本页教学点在 pages/json-mode.html。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runJsonMode } from "../lib/flow/run-json-mode.js";
import { logger } from "../lib/logger.js";

export function mountJsonModeRoutes(router: Router): void {
  router.post("/api/json-mode", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const prompt = readPrompt(ctx);
    if (!prompt) return;

    console.log(
      `\n/api/json-mode 开始: provider=${client.provider} model=${client.modelA}`,
    );
    console.log(`  prompt: ${JSON.stringify(prompt)}`);
    logger.info(
      "route.json-mode",
      "POST /api/json-mode 收到请求",
      "JSON Mode（语法闸）入口；记 provider / model / prompt 便于排查「换模型后行为变了」",
      { provider: client.provider, model: client.modelA, prompt },
    );

    try {
      ctx.body = await runJsonMode(client, prompt);
    } catch (err: unknown) {
      console.error(
        `  /api/json-mode error: ${err instanceof Error ? err.message : String(err)}`,
      );
      logger.error(
        "route.json-mode",
        "runJsonMode threw",
        "协议 A 抛异常（网络 / 5xx / 4xx）；记 upstreamStatus + 错误信息便于排错，并返回前端",
        { mode: "json_object", err: err instanceof Error ? err.message : String(err) },
      );
      writeUpstreamError(ctx, err, { mode: "json_object" });
    }
  });
}
