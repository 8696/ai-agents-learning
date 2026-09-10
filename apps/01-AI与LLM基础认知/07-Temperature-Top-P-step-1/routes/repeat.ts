/**
 * 职责：POST /api/repeat —— 固定一组 temperature / top_p 连跑 N 次，看去重后剩几种说法。
 * 数据流：{ prompt?, runs?, temperature?, topP? } → 校验 → flow/run-repeat → RepeatResponse。
 * 为什么单独一个端点：扫描页回答「换参数会怎样」，本端点回答「同一组参数重复会怎样」，
 *   后者才是判断「这档参数能不能拿去做抽取任务」的依据。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostRepeat 封装层）；
 *   Key 缺失单独写 info（校验拒绝）；真正发网络请求的日志全部在 lib/sampling/call-once.ts。
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
import { logger } from "../lib/logger.js";

export function mountRepeatRoutes(router: Router): void {
  router.post("/api/repeat", async (ctx: Context) => {
    // ① Key 校验在前：没 Key 就别让上游 SDK 抛一句读不懂的错。
    const llm = requireLlm(ctx);
    if (!llm) {
      logger.info(
        "api.repeat",
        "POST /api/repeat 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；没 Key 就别让上游 SDK 抛一句读不懂的错。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/repeat" },
      );
      return;
    }
    const body = readSamplingBody(ctx);
    if (!body) {
      logger.info(
        "api.repeat",
        "POST /api/repeat 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到 runGroup；记下 rawBody 便于复盘哪类失败最常见。当前：body 不合法。",
        { endpoint: "POST /api/repeat" },
      );
      return;
    }

    const prompt = body.prompt ?? DEFAULT_PROMPT;
    const runs = body.runs ?? DEFAULT_REPEAT_RUNS;
    // ② 两个旋钮都要有明确取值再往下走：默认值来自 presets，页面上也照原样显示，
    //    否则读者看到「5 次里有 3 种说法」却不知道这是哪一档跑出来的。
    const params = {
      temperature: body.temperature ?? DEFAULT_SWEEP_TEMPERATURE,
      topP: body.topP ?? FIXED_TOP_P,
    };

    const tHandlerStart = Date.now();
    logger.info(
      "api.repeat",
      "调用函数开始：handlePostRepeat",
      "为什么写这条日志：route 只认这一层返回的 RepeatResponse；里面 runRepeat 是真正干活的那一层。当前：即将交给 runRepeat。",
      {
        入参: { T: params.temperature, topP: params.topP, runs, promptLen: prompt.length },
        __code: `ctx.body = await runRepeat({ llm, prompt, params, runs });`,
      },
    );

    try {
      const result = await runRepeat({ llm, prompt, params, runs });
      ctx.body = result;
      logger.info(
        "api.repeat",
        "调用函数结束：handlePostRepeat",
        "为什么写这条日志：route 要把 RepeatResponse 写进 ctx.body 交给页面 stats 区。当前：runRepeat 已返回。",
        {
          返回值: {
            T: params.temperature,
            topP: params.topP,
            runs,
            verdict: result.group.verdict,
            durationMs: result.durationMs,
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (error: unknown) {
      logger.error(
        "api.repeat",
        "调用函数结束：handlePostRepeat（失败）",
        "为什么写这条日志：runRepeat 抛错说明整轮都没跑起来（单次失败已在 callOnce 内转成 SingleRun.error）；记 err 便于写 writeUpstreamError。当前：runRepeat 抛错，已交给 writeUpstreamError 写统一错误响应。",
        {
          返回值: { mode: "repeat", error: error instanceof Error ? error.message : String(error) },
          耗时ms: Date.now() - tHandlerStart,
          错误: error,
        },
      );
      console.error("/api/repeat error:", error);
      writeUpstreamError(ctx, error, { mode: "repeat" });
    }
  });
}