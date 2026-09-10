/**
 * 职责：POST /api/tool-use —— 协议 B 强制 tool_choice（类 Structured Output）。
 * 数据流：{ prompt } → runToolUseForced → input 已是对象 + Zod。
 * 本页教学点在 pages/tool-use.html。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostToolUse 封装层）；
 *   Key 缺失单独写 info（校验拒绝）；子调用 runToolUseForced 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runToolUseForced } from "../lib/flow/run-tool-use.js";
import { logger } from "../lib/logger.js";

export function mountToolUseRoutes(router: Router): void {
  router.post("/api/tool-use", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.tool-use",
        "POST /api/tool-use 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/tool-use" },
      );
      return;
    }
    const prompt = readPrompt(ctx);
    if (!prompt) {
      logger.info(
        "api.tool-use",
        "POST /api/tool-use 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到 runToolUseForced；记 reason 便于复盘。当前：body 不合法。",
        { endpoint: "POST /api/tool-use" },
      );
      return;
    }

    console.log(
      `\n/api/tool-use 开始: provider=${client.provider} model=${client.modelB}`,
    );
    console.log(`  prompt: ${JSON.stringify(prompt)}`);
    logger.info(
      "api.tool-use",
      "调用函数开始：handlePostToolUse",
      "为什么写这条日志：route 只认这一层返回的 ModeCallResult；里面 runToolUseForced 是真正干活的那一层（协议 B 强制 tool_choice）。当前：prompt + tools + tool_choice 三件套在 runToolUseForced 内拼装；这里只写 prompt 便于和响应 tool_use.input 对照。",
      {
        入参: { provider: client.provider, model: client.modelB, promptPreview: prompt.slice(0, 60), promptLen: prompt.length },
        __code: `ctx.body = await runToolUseForced(client, prompt);`,
      },
    );

    try {
      ctx.body = await runToolUseForced(client, prompt);
      logger.info(
        "api.tool-use",
        "调用函数结束：handlePostToolUse",
        "为什么写这条日志：route 要把 ModeCallResult 写进 ctx.body 交给页面 stats 区；记 parseOk + toolUse 便于核对。",
        {
          返回值: { mode: (ctx.body as { mode: string }).mode, parseOk: (ctx.body as { parseOk: boolean }).parseOk, toolUse: (ctx.body as { toolUse: unknown }).toolUse, elapsedMs: (ctx.body as { elapsedMs: number }).elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      console.error(
        `  /api/tool-use error: ${err instanceof Error ? err.message : String(err)}`,
      );
      logger.error(
        "api.tool-use",
        "调用函数结束：handlePostToolUse（失败）",
        "为什么写这条日志：把上游 SDK 抛的错原样写出来，便于按 status / message 排错。protocolB 几乎不在 API 入口 400 坏 schema，所以这里通常是 Key / 限流 / 网关错。",
        {
          返回值: { mode: "tool_use_forced", error: err instanceof Error ? err.message : String(err) },
          耗时ms: Date.now() - tHandlerStart,
          错误: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
        },
      );
      writeUpstreamError(ctx, err, { mode: "tool_use_forced" });
    }
  });
}