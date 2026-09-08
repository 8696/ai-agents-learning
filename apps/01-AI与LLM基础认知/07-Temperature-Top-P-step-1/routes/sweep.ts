/**
 * 职责：两个参数扫描端点 —— POST /api/sweep/temperature 与 POST /api/sweep/top-p。
 * 数据流：{ prompt?, runs?, temperature? } → 闸门 → flow/run-sweep → SweepResponse。
 * 为什么两个端点同一个文件：它们是同一套流程的两个轴（固定一个旋钮、扫另一个），
 *   参数校验、日志、错误处理完全相同；分成两个文件只会得到两份会漂移的复制品。
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostSweepTemperature / handlePostSweepTopP 封装层）；
 *   Key 缺失单独打 info 闸门拒绝；真正出网日志全部在 lib/sampling/call-once.ts。
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
import { logger } from "../lib/logger.js";

export function mountSweepRoutes(router: Router): void {
  // ── 扫温度：Top-P 固定 1 ──
  router.post("/api/sweep/temperature", async (ctx: Context) => {
    // ① 先查 Key（503）再查参数（400）：没 Key 时参数对不对根本不重要。
    const llm = requireLlm(ctx);
    if (!llm) {
      logger.info(
        "api.sweep.temperature",
        "POST /api/sweep/temperature 被无 Key 闸门挡掉",
        "为什么打：服务端兜底；没 Key 时参数对不对根本不重要。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/sweep/temperature" },
      );
      return;
    }
    const body = readSamplingBody(ctx);
    if (!body) {
      logger.info(
        "api.sweep.temperature",
        "POST /api/sweep/temperature 被入参闸门挡掉",
        "为什么打：闸门挡掉没花模型额度也没走到 runTemperatureSweep。当前：body 不合法。",
        { endpoint: "POST /api/sweep/temperature" },
      );
      return;
    }

    const prompt = body.prompt ?? DEFAULT_PROMPT;
    const runs = body.runs ?? DEFAULT_RUNS_PER_GROUP;

    const tHandlerStart = Date.now();
    logger.info(
      "api.sweep.temperature",
      "调用函数开始：handlePostSweepTemperature",
      "为什么打：route 只认这一层返回的 SweepResponse；里面 runTemperatureSweep 是「真活」。当前：扫温度即将开始；Top-P 固定 1。",
      {
        入参: { promptPreview: prompt.slice(0, 40), runs },
        __code: `ctx.body = await runTemperatureSweep({ llm, prompt, runs });`,
      },
    );

    try {
      const result = await runTemperatureSweep({ llm, prompt, runs });
      ctx.body = result;
      logger.info(
        "api.sweep.temperature",
        "调用函数结束：handlePostSweepTemperature",
        "为什么打：route 要把 SweepResponse（axis=temperature, 三档 verdict）写进 ctx.body 交给页面。当前：runTemperatureSweep 已返回。",
        {
          返回值: {
            axis: result.axis,
            fixed: result.fixed,
            groupsCount: result.groups.length,
            verdicts: result.groups.map((g) => ({ label: g.label, verdict: g.verdict })),
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (error: unknown) {
      // ② 到这一步的一定是「整轮都没跑起来」的异常；单次失败已经在 callOnce 里变成卡片上的红块。
      logger.error(
        "api.sweep.temperature",
        "调用函数结束：handlePostSweepTemperature（失败）",
        "为什么打：runTemperatureSweep 抛错说明整轮都没跑起来（单次失败已在 callOnce 内转成 SingleRun.error）；记 err 便于写 writeUpstreamError。当前：已交给 writeUpstreamError 写统一错误响应。",
        {
          返回值: { axis: "temperature", error: error instanceof Error ? error.message : String(error) },
          耗时ms: Date.now() - tHandlerStart,
          错误: error,
        },
      );
      console.error("/api/sweep/temperature error:", error);
      writeUpstreamError(ctx, error, { axis: "temperature" });
    }
  });

  // ── 扫 Top-P：温度由页面给（默认 1；选 0 是为了验证贪心解码下 Top-P 不起作用）──
  router.post("/api/sweep/top-p", async (ctx: Context) => {
    const llm = requireLlm(ctx);
    if (!llm) {
      logger.info(
        "api.sweep.top-p",
        "POST /api/sweep/top-p 被无 Key 闸门挡掉",
        "为什么打：服务端兜底；没 Key 时参数对不对根本不重要。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/sweep/top-p" },
      );
      return;
    }
    const body = readSamplingBody(ctx);
    if (!body) {
      logger.info(
        "api.sweep.top-p",
        "POST /api/sweep/top-p 被入参闸门挡掉",
        "为什么打：闸门挡掉没花模型额度也没走到 runTopPSweep。当前：body 不合法。",
        { endpoint: "POST /api/sweep/top-p" },
      );
      return;
    }

    const prompt = body.prompt ?? DEFAULT_PROMPT;
    const runs = body.runs ?? DEFAULT_RUNS_PER_GROUP;
    const temperature = body.temperature ?? DEFAULT_SWEEP_TEMPERATURE;

    const tHandlerStart = Date.now();
    logger.info(
      "api.sweep.top-p",
      "调用函数开始：handlePostSweepTopP",
      "为什么打：route 只认这一层返回的 SweepResponse；里面 runTopPSweep 是「真活」。当前：扫 Top-P 即将开始；温度由调用方给（默认 1；选 0 验证贪心解码下 Top-P 不起作用）。",
      {
        入参: { temperature, runs, promptLen: prompt.length },
        __code: `ctx.body = await runTopPSweep({ llm, prompt, runs, temperature });`,
      },
    );

    try {
      const result = await runTopPSweep({ llm, prompt, runs, temperature });
      ctx.body = result;
      logger.info(
        "api.sweep.top-p",
        "调用函数结束：handlePostSweepTopP",
        "为什么打：route 要把 SweepResponse（axis=top_p, 三档 verdict）写进 ctx.body 交给页面。当前：runTopPSweep 已返回。",
        {
          返回值: {
            axis: result.axis,
            fixed: result.fixed,
            groupsCount: result.groups.length,
            verdicts: result.groups.map((g) => ({ label: g.label, verdict: g.verdict })),
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (error: unknown) {
      logger.error(
        "api.sweep.top-p",
        "调用函数结束：handlePostSweepTopP（失败）",
        "为什么打：runTopPSweep 抛错说明整轮都没跑起来（单次失败已在 callOnce 内转成 SingleRun.error）；记 err 便于写 writeUpstreamError。当前：已交给 writeUpstreamError 写统一错误响应。",
        {
          返回值: { axis: "top_p", error: error instanceof Error ? error.message : String(error) },
          耗时ms: Date.now() - tHandlerStart,
          错误: error,
        },
      );
      console.error("/api/sweep/top-p error:", error);
      writeUpstreamError(ctx, error, { axis: "top_p" });
    }
  });
}