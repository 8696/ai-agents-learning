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
import { logger } from "../lib/logger.js";

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
    logger.info(
      "route.text",
      "POST /api/text 入参",
      "请求入口；prompt 是协议 B 无 tools 路径的唯一素材 —— 没有 tools / input_schema / response_format 三个开关，全靠 prompt 强约束。打出来便于和响应 raw 对照（模型加不加 fence、是否遵守 enum）。",
      { provider: client.provider, model: client.modelB, prompt },
    );

    try {
      ctx.body = await runTextNoTools(client, prompt);
    } catch (err: unknown) {
      console.error(
        `  /api/text error: ${err instanceof Error ? err.message : String(err)}`,
      );
      logger.error(
        "route.text",
        "runTextNoTools 抛错",
        "把上游 SDK 抛的错原样打出来，便于按 status / message 排错（401=Key、429=限流、5xx=网关）。",
        { err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err) },
      );
      writeUpstreamError(ctx, err, { mode: "text_no_tools" });
    }
  });
}
