/**
 * 职责：POST /api/tool-rejected —— prompt 诱导 enum 外的 action，看守约。
 * 数据流：无 body prompt → INDUCE_UNKNOWN_PROMPT → runToolRejected → { violated }。
 * 本页教学点在 pages/tool-rejected.html。Anthropic 不会因坏 schema 在入口 400。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostToolRejected 封装层）；
 *   Key 缺失单独写 info（校验拒绝）；子调用 runToolRejected 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runToolRejected } from "../lib/flow/run-tool-rejected.js";
import { logger } from "../lib/logger.js";

export function mountToolRejectedRoutes(router: Router): void {
  router.post("/api/tool-rejected", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.tool-rejected",
        "POST /api/tool-rejected 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/tool-rejected" },
      );
      return;
    }

    console.log(
      `\n/api/tool-rejected: prompt 强引导给 enum 外字段，看模型守不守 input_schema`,
    );
    logger.info(
      "api.tool-rejected",
      "调用函数开始：handlePostToolRejected",
      "为什么写这条日志：route 只认这一层返回的 ToolRejectedResult；里面 runToolRejected 是真正干活的那一层。当前：诱导守约入口——无 body prompt，INDUCE_UNKNOWN_PROMPT 写死在 schema/intent.ts。",
      {
        入参: { provider: client.provider, model: client.modelB },
        __code: `ctx.body = await runToolRejected(client);`,
      },
    );

    try {
      ctx.body = await runToolRejected(client);
      logger.info(
        "api.tool-rejected",
        "调用函数结束：handlePostToolRejected",
        "为什么写这条日志：route 要把 ToolRejectedResult 写进 ctx.body 交给页面 stats 区；记 violated + parseOk 便于核对。",
        {
          返回值: { parseOk: (ctx.body as { parseOk: boolean }).parseOk, violated: (ctx.body as { violated: boolean }).violated, toolUsed: (ctx.body as { toolUse?: { name?: string } }).toolUse?.name ?? null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  /api/tool-rejected 拿到错: ${msg.slice(0, 300)}`);
      logger.error(
        "api.tool-rejected",
        "调用函数结束：handlePostToolRejected（失败）",
        "为什么写这条日志：诱导测试本身不抛错；如果抛，几乎一定是 Key / 网关 / 限流。记 err 便于排错。",
        {
          返回值: { mode: "tool_use_forced", rejected: true, error: msg },
          耗时ms: Date.now() - tHandlerStart,
          错误: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
        },
      );
      writeUpstreamError(ctx, err, {
        mode: "tool_use_forced",
        rejected: true,
      });
    }
  });
}