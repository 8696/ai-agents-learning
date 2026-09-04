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
import { logger } from "../lib/logger.js";

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
    logger.info(
      "route.toolUse",
      "POST /api/tool-use 入参",
      "请求入口；prompt + tools + tool_choice 三件套在 runToolUseForced 内拼装。这里只打 prompt 便于和响应 tool_use.input 对照（模型可能不守 enum，violated 在 /api/tool-rejected 测）。",
      { provider: client.provider, model: client.modelB, prompt },
    );

    try {
      ctx.body = await runToolUseForced(client, prompt);
    } catch (err: unknown) {
      console.error(
        `  /api/tool-use error: ${err instanceof Error ? err.message : String(err)}`,
      );
      logger.error(
        "route.toolUse",
        "runToolUseForced 抛错",
        "把上游 SDK 抛的错原样打出来，便于按 status / message 排错。protocolB 几乎不在 API 入口 400 坏 schema，所以这里通常是 Key / 限流 / 网关错。",
        { err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err) },
      );
      writeUpstreamError(ctx, err, { mode: "tool_use_forced" });
    }
  });
}
