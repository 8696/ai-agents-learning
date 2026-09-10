/**
 * 职责：POST /api/billing —— 真调一次模型，回一份「这次花了多少」的账单。
 * 数据流：{ prompt, maxTokens } → 校验 → measureOneCall → { measurement }；失败走统一错误出口。
 * 本页教学点在 public/pages/usage.html：一次请求里 usage 是分成输入 / 输出两栏的。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostBilling 封装层）；
 *   Key 缺失 / body 缺失单独写 info（校验拒绝）——不算调用，不套五条日志；
 *   失败用 error + （失败）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readBillingBody } from "../lib/http/request-guards.js";
import { writeMeasurementError } from "../lib/http/write-upstream-error.js";
import { measureOneCall, logMeasurement } from "../lib/flow/measure-one-call.js";
import { logger } from "../lib/logger.js";

export function mountBillingRoutes(router: Router): void {
  router.post("/api/billing", async (ctx: Context) => {
    // ① 先查 Key（没 Key 连参数都不用看），② 再查 body：顺序反过来会让没 Key 的人先收到 400，误导
    const client = requireLlm(ctx);
    if (!client) {
      logger.info(
        "api.billing",
        "POST /api/billing 被无 Key 校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到「调用模型」，但客户端要知道「为什么 503」。当前：apps/.env 当前 LLM_PROVIDER 无 Key。",
        { endpoint: "POST /api/billing" },
      );
      return;
    }
    const body = readBillingBody(ctx);
    if (!body) {
      logger.info(
        "api.billing",
        "POST /api/billing 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到「调用模型」，但客户端要知道「为什么 400」。当前：body 不合法。",
        { endpoint: "POST /api/billing" },
      );
      return;
    }

    const tHandlerStart = Date.now();
    logger.info(
      "api.billing",
      "调用函数开始：handlePostBilling",
      "为什么写这条日志：route 只认这一层返回的 BillingMeasurement；里面那次才是真发网络请求（看「调用模型开始：对话补全」）。当前：POST /api/billing 入参已校验通过，即将交给 measureOneCall。",
      {
        入参: {
          promptPreview: body.prompt.slice(0, 50),
          promptLen: body.prompt.length,
          maxTokens: body.maxTokens,
          llmProvider: client.provider,
          llmModelA: client.modelA,
        },
        __code: `const measurement = await measureOneCall({ llm: client, label: "单次计费", prompt: body.prompt, maxTokens: body.maxTokens });`,
      },
    );

    try {
      const measurement = await measureOneCall({
        llm: client,
        label: "单次计费",
        prompt: body.prompt,
        maxTokens: body.maxTokens,
      });
      logMeasurement("/api/billing", measurement);
      ctx.body = { mode: "single", measurement };

      logger.info(
        "api.billing",
        "调用函数结束：handlePostBilling",
        "为什么写这条日志：route 要把 measurement 写进 ctx.body 交给页面 stats 区，和 measureOneCall 的结束 log 互为对照。当前：measurement 已落 ctx.body。",
        {
          返回值: {
            label: measurement.label,
            usage: measurement.usage,
            cost: measurement.cost,
            finishReason: measurement.finishReason,
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    } catch (err: unknown) {
      logger.error(
        "api.billing",
        "调用函数结束：handlePostBilling（失败）",
        "为什么写这条日志：第二次失败时前面那次的钱已经花掉了，错误里要说明「可能只跑成了一次」；这里把 err 落进日志便于上层 writeMeasurementError 决定 status。当前：measureOneCall 抛错，已交给 writeMeasurementError 写统一错误响应。",
        {
          返回值: {
            mode: "single",
            error: err instanceof Error ? err.message : String(err),
          },
          耗时ms: Date.now() - tHandlerStart,
          错误: err,
        },
      );
      console.error("[/api/billing] 失败：", err);
      writeMeasurementError(ctx, err, { mode: "single" });
    }
  });
}