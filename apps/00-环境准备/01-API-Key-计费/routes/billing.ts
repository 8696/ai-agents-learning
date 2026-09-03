/**
 * 职责：POST /api/billing —— 真调一次模型，回一份「这次花了多少」的账单。
 * 数据流：{ prompt, maxTokens } → 闸门 → measureOneCall → { measurement }；失败走统一错误出口。
 * 本页教学点在 public/pages/usage.html：一次请求里 usage 是分成输入 / 输出两栏的。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readBillingBody } from "../lib/http/request-guards.js";
import { writeMeasurementError } from "../lib/http/write-upstream-error.js";
import { measureOneCall, logMeasurement } from "../lib/flow/measure-one-call.js";

export function mountBillingRoutes(router: Router): void {
  router.post("/api/billing", async (ctx: Context) => {
    // ① 先查 Key（没 Key 连参数都不用看），② 再查 body：顺序反过来会让没 Key 的人先收到 400，误导
    const client = requireLlm(ctx);
    if (!client) return;
    const body = readBillingBody(ctx);
    if (!body) return;

    try {
      const measurement = await measureOneCall({
        llm: client,
        label: "单次计费",
        prompt: body.prompt,
        maxTokens: body.maxTokens,
      });
      logMeasurement("/api/billing", measurement);
      ctx.body = { mode: "single", measurement };
    } catch (err: unknown) {
      console.error("[/api/billing] 失败：", err);
      writeMeasurementError(ctx, err, { mode: "single" });
    }
  });
}
