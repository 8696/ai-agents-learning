/**
 * 职责：POST /api/repeat —— 固定一组 temperature / top_p 连跑 N 次，看去重后剩几种说法。
 * 数据流：{ prompt?, runs?, temperature?, topP? } → 闸门 → flow/run-repeat → RepeatResponse。
 * 为什么单独一个端点：扫描页回答「换参数会怎样」，本端点回答「同一组参数重复会怎样」，
 *   后者才是判断「这档参数能不能拿去做抽取任务」的依据。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readSamplingBody, requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runRepeat } from "../lib/flow/run-repeat.js";
import {
  DEFAULT_PROMPT,
  DEFAULT_REPEAT_RUNS,
  FIXED_TOP_P,
  DEFAULT_SWEEP_TEMPERATURE,
} from "../lib/sampling/presets.js";

export function mountRepeatRoutes(router: Router): void {
  router.post("/api/repeat", async (ctx: Context) => {
    // ① Key 闸门在前：没 Key 就别让上游 SDK 抛一句读不懂的错。
    const llm = requireLlm(ctx);
    if (!llm) return;
    const body = readSamplingBody(ctx);
    if (!body) return;

    const prompt = body.prompt ?? DEFAULT_PROMPT;
    const runs = body.runs ?? DEFAULT_REPEAT_RUNS;
    // ② 两个旋钮都要有明确取值再往下走：默认值来自 presets，页面上也照原样显示，
    //    否则读者看到「5 次里有 3 种说法」却不知道这是哪一档跑出来的。
    const params = {
      temperature: body.temperature ?? DEFAULT_SWEEP_TEMPERATURE,
      topP: body.topP ?? FIXED_TOP_P,
    };
    console.log(`/api/repeat T=${params.temperature} top_p=${params.topP} runs=${runs}`);

    try {
      ctx.body = await runRepeat({ llm, prompt, params, runs });
    } catch (error: unknown) {
      console.error("/api/repeat error:", error);
      writeUpstreamError(ctx, error, { mode: "repeat" });
    }
  });
}
