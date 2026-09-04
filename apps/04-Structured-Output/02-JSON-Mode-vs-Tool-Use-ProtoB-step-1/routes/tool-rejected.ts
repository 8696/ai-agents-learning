/**
 * 职责：POST /api/tool-rejected —— prompt 诱导 enum 外的 action，看守约。
 * 数据流：无 body prompt → INDUCE_UNKNOWN_PROMPT → runToolRejected → { violated }。
 * 本页教学点在 pages/tool-rejected.html。Anthropic 不会因坏 schema 在入口 400。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runToolRejected } from "../lib/flow/run-tool-rejected.js";
import { logger } from "../lib/logger.js";

export function mountToolRejectedRoutes(router: Router): void {
  router.post("/api/tool-rejected", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;

    console.log(
      `\n/api/tool-rejected: prompt 强引导给 enum 外字段，看模型守不守 input_schema`,
    );
    logger.info(
      "route.toolRejected",
      "POST /api/tool-rejected 入口",
      "诱导守约入口 —— 无 body prompt，INDUCE_UNKNOWN_PROMPT 写死在 schema/intent.ts。打这条是为了把「路由命中 → 走 runToolRejected」和「runToolRejected → 实际调 LLM」两段在日志里分开，便于按时间序排错。",
      { provider: client.provider, model: client.modelB },
    );

    try {
      ctx.body = await runToolRejected(client);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  /api/tool-rejected 拿到错: ${msg.slice(0, 300)}`);
      logger.error(
        "route.toolRejected",
        "runToolRejected 抛错",
        "诱导测试本身不抛错；如果抛，几乎一定是 Key / 网关 / 限流。",
        { err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err) },
      );
      writeUpstreamError(ctx, err, {
        mode: "tool_use_forced",
        rejected: true,
      });
    }
  });
}
