/**
 * 职责：POST /api/run-realistic ——「差旅助手」完整业务流。
 * 数据流：{ prompt } → runToolLoop(maxRounds=5)，共用 lib/flow/run-tool-loop.ts。
 *
 * 本 route 自己的 system prompt 引导模型只调 trip_* 这 5 个工具；
 * 旧 4 个 tool（add / get_weather / lookup_user / search_wiki）
 *   是 tool-defs.ts 的，由其它 route 的 system prompt 引导，与本页互不干扰。
 *
 * 为什么需要单独 system prompt：registry 里现在有 9 个 tool，
 *   不写明「只用哪些」模型会犹豫 —— 这是 system prompt 的真实作用，不是装饰。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readPrompt } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runToolLoop } from "../lib/flow/run-tool-loop.js";

export const SYSTEM_PROMPT_REALISTIC =
  "你是一个差旅规划助手。能用的工具只有 5 个：trip_weather / trip_exchange / trip_attractions / trip_flights / trip_hotels。\n" +
  "不要调用其他工具（add / get_weather / lookup_user / search_wiki 是别的 Demo 的，请忽略）。\n" +
  "工作方式：先并行查无依赖项（天气 + 汇率 + 景点可同轮），再串行算预算（酒店总价依赖汇率 / 机票价格），最后综合出行程单。";

export function mountRunRealisticRoutes(router: Router): void {
  router.post("/api/run-realistic", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const prompt = readPrompt(ctx);
    if (!prompt) return;

    console.log(`\n/api/run-realistic 开始: provider=${client.provider} model=${client.modelA}`);
    console.log(`  prompt: ${JSON.stringify(prompt)}`);
    console.log(
      `  system_prompt (${SYSTEM_PROMPT_REALISTIC.length} chars): ${SYSTEM_PROMPT_REALISTIC.slice(0, 180)}…`,
    );

    try {
      const out = await runToolLoop({
        llm: client,
        prompt,
        system: SYSTEM_PROMPT_REALISTIC,
        maxRounds: 5,
      });
      ctx.body = { mode: "run-realistic", ...out };
    } catch (err: unknown) {
      console.error(
        `  /api/run-realistic error: ${err instanceof Error ? err.message : String(err)}`,
      );
      writeUpstreamError(ctx, err, { mode: "run-realistic" });
    }
  });
}