/**
 * 职责：两个参数扫描端点 —— POST /api/sweep/temperature 与 POST /api/sweep/top-p。
 * 数据流：{ prompt?, runs?, temperature? } → 闸门 → flow/run-sweep → SweepResponse。
 * 为什么两个端点同一个文件：它们是同一套流程的两个轴（固定一个旋钮、扫另一个），
 *   参数校验、日志、错误处理完全相同；分成两个文件只会得到两份会漂移的复制品。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readSamplingBody, requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runTemperatureSweep, runTopPSweep } from "../lib/flow/run-sweep.js";
import {
  DEFAULT_PROMPT,
  DEFAULT_RUNS_PER_GROUP,
  DEFAULT_SWEEP_TEMPERATURE,
} from "../lib/sampling/presets.js";

export function mountSweepRoutes(router: Router): void {
  // ── 扫温度：Top-P 固定 1 ──
  router.post("/api/sweep/temperature", async (ctx: Context) => {
    // ① 先查 Key（503）再查参数（400）：没 Key 时参数对不对根本不重要。
    const llm = requireLlm(ctx);
    if (!llm) return;
    const body = readSamplingBody(ctx);
    if (!body) return;

    const prompt = body.prompt ?? DEFAULT_PROMPT;
    const runs = body.runs ?? DEFAULT_RUNS_PER_GROUP;
    console.log(`/api/sweep/temperature prompt=${JSON.stringify(prompt.slice(0, 40))} runs=${runs}`);

    try {
      ctx.body = await runTemperatureSweep({ llm, prompt, runs });
    } catch (error: unknown) {
      // ② 到这一步的一定是「整轮都没跑起来」的异常；单次失败已经在 callOnce 里变成卡片上的红块。
      console.error("/api/sweep/temperature error:", error);
      writeUpstreamError(ctx, error, { axis: "temperature" });
    }
  });

  // ── 扫 Top-P：温度由页面给（默认 1；选 0 是为了验证贪心解码下 Top-P 不起作用）──
  router.post("/api/sweep/top-p", async (ctx: Context) => {
    const llm = requireLlm(ctx);
    if (!llm) return;
    const body = readSamplingBody(ctx);
    if (!body) return;

    const prompt = body.prompt ?? DEFAULT_PROMPT;
    const runs = body.runs ?? DEFAULT_RUNS_PER_GROUP;
    const temperature = body.temperature ?? DEFAULT_SWEEP_TEMPERATURE;
    console.log(`/api/sweep/top-p temperature=${temperature} runs=${runs}`);

    try {
      ctx.body = await runTopPSweep({ llm, prompt, runs, temperature });
    } catch (error: unknown) {
      console.error("/api/sweep/top-p error:", error);
      writeUpstreamError(ctx, error, { axis: "top_p" });
    }
  });
}
