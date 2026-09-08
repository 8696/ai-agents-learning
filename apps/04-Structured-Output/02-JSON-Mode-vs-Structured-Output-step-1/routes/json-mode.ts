/**
 * 职责：POST /api/json-mode —— 语法闸（response_format: json_object）。
 * 数据流：{ prompt } → runJsonMode → { mode, raw, parsed, analysis, … }。
 * 本页教学点在 pages/json-mode.html。
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostJsonMode 封装层）；
 *   Key 缺失单独打 info 闸门拒绝；子调用 runJsonMode 内部已自带五件套。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runJsonMode } from "../lib/flow/run-json-mode.js";
import { logger } from "../lib/logger.js";

export function mountJsonModeRoutes(router: Router): void {
  router.post("/api/json-mode", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.json-mode",
        "POST /api/json-mode 被无 Key 闸门挡掉",
        "为什么打：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/json-mode" },
      );
      return;
    }
    const prompt = readPrompt(ctx);
    if (!prompt) {
      logger.info(
        "api.json-mode",
        "POST /api/json-mode 被入参闸门挡掉",
        "为什么打：闸门挡掉没花模型额度也没走到 runJsonMode；记 reason 便于复盘。当前：body 不合法。",
        { endpoint: "POST /api/json-mode" },
      );
      return;
    }

    console.log(
      `\n/api/json-mode 开始: provider=${client.provider} model=${client.modelA}`,
    );
    console.log(`  prompt: ${JSON.stringify(prompt)}`);
    logger.info(
      "api.json-mode",
      "调用函数开始：handlePostJsonMode",
      "为什么打：route 只认这一层返回的 ModeCallResult；里面 runJsonMode 是「真活」。当前：JSON Mode（语法闸）入口；记 provider / model / prompt 便于排查「换模型后行为变了」。",
      {
        入参: { provider: client.provider, model: client.modelA, promptPreview: prompt.slice(0, 60), promptLen: prompt.length },
        __code: `ctx.body = await runJsonMode(client, prompt);`,
      },
    );

    try {
      ctx.body = await runJsonMode(client, prompt);
      logger.info(
        "api.json-mode",
        "调用函数结束：handlePostJsonMode",
        "为什么打：route 要把 ModeCallResult 写进 ctx.body 交给页面 stats 区；记 parseOk 便于核对。",
        {
          返回值: { mode: (ctx.body as { mode: string }).mode, parseOk: (ctx.body as { parseOk: boolean }).parseOk, elapsedMs: (ctx.body as { elapsedMs: number }).elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      console.error(
        `  /api/json-mode error: ${err instanceof Error ? err.message : String(err)}`,
      );
      logger.error(
        "api.json-mode",
        "调用函数结束：handlePostJsonMode（失败）",
        "为什么打：协议 A 抛异常（网络 / 5xx / 4xx）；记 upstreamStatus + 错误信息便于排错，并返回前端。当前：runJsonMode 抛错，已交给 writeUpstreamError 写统一错误响应。",
        {
          返回值: { mode: "json_object", error: err instanceof Error ? err.message : String(err) },
          耗时ms: Date.now() - tHandlerStart,
          错误: err,
        },
      );
      writeUpstreamError(ctx, err, { mode: "json_object" });
    }
  });
}