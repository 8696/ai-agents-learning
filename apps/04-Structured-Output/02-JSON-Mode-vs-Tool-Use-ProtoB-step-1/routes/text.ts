/**
 * 职责：POST /api/text —— 协议 B 无 tools（类 JSON Mode，语法闸弱对应）。
 * 数据流：{ prompt } → runTextNoTools → { mode: text_no_tools, raw, parsed, analysis }。
 * 本页教学点在 pages/text.html。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostText 封装层）；
 *   Key 缺失单独写 info（校验拒绝）；子调用 runTextNoTools 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runTextNoTools } from "../lib/flow/run-text.js";
import { logger } from "../lib/logger.js";

export function mountTextRoutes(router: Router): void {
  router.post("/api/text", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.text",
        "POST /api/text 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/text" },
      );
      return;
    }
    const prompt = readPrompt(ctx);
    if (!prompt) {
      logger.info(
        "api.text",
        "POST /api/text 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到 runTextNoTools；记 reason 便于复盘。当前：body 不合法。",
        { endpoint: "POST /api/text" },
      );
      return;
    }

    console.log(
      `\n/api/text 开始: provider=${client.provider} model=${client.modelB}`,
    );
    console.log(`  prompt: ${JSON.stringify(prompt)}`);
    logger.info(
      "api.text",
      "调用函数开始：handlePostText",
      "为什么写这条日志：route 只认这一层返回的 ModeCallResult；里面 runTextNoTools 是真正干活的那一层（协议 B 无 tools 路径）。当前：prompt 是协议 B 无 tools 路径的唯一素材——没有 tools / input_schema / response_format 三个开关，全靠 prompt 强约束。",
      {
        入参: { provider: client.provider, model: client.modelB, promptPreview: prompt.slice(0, 60), promptLen: prompt.length },
        __code: `ctx.body = await runTextNoTools(client, prompt);`,
      },
    );

    try {
      ctx.body = await runTextNoTools(client, prompt);
      logger.info(
        "api.text",
        "调用函数结束：handlePostText",
        "为什么写这条日志：route 要把 ModeCallResult 写进 ctx.body 交给页面 stats 区；记 parseOk 便于和 tool-use 对照。",
        {
          返回值: { mode: (ctx.body as { mode: string }).mode, parseOk: (ctx.body as { parseOk: boolean }).parseOk, elapsedMs: (ctx.body as { elapsedMs: number }).elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      console.error(
        `  /api/text error: ${err instanceof Error ? err.message : String(err)}`,
      );
      logger.error(
        "api.text",
        "调用函数结束：handlePostText（失败）",
        "为什么写这条日志：把上游 SDK 抛的错原样写出来，便于按 status / message 排错（401=Key、429=限流、5xx=网关）。",
        {
          返回值: { mode: "text_no_tools", error: err instanceof Error ? err.message : String(err) },
          耗时ms: Date.now() - tHandlerStart,
          错误: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
        },
      );
      writeUpstreamError(ctx, err, { mode: "text_no_tools" });
    }
  });
}