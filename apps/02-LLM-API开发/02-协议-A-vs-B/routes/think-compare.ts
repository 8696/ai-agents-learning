/**
 * 职责：POST /api/think-compare —— 4 组一次性：A 关/开 × B 关/开。
 * 数据流：runThinkScenarioA ×2 ∥ runThinkScenarioB ×2 → shapeThinkScenarios。
 * 分叉在本 route 分别调用两个 protocol 函数，禁止同一个 send 里 if protocol。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { performance } from "node:perf_hooks";
import { shapeThinkScenarios } from "../lib/compare/shape-once.js";
import { readCallBody, requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { runThinkScenarioA } from "../lib/protocol-a/send-once.js";
import { runThinkScenarioB } from "../lib/protocol-b/send-once.js";

const B_THINKING = { type: "enabled" as const, budget_tokens: 500 };

export function mountThinkCompareRoutes(router: Router): void {
  router.post("/api/think-compare", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const body = readCallBody(ctx);
    if (!body) return;

    console.log(
      `\n[${(performance.now() / 1000).toFixed(2)}s] /api/think-compare: 开始 4 组对比`,
    );

    try {
      const [aOff, aOn, bOff, bOn] = await Promise.all([
        runThinkScenarioA(client, body, "A · 不带 thinking", false),
        runThinkScenarioA(client, body, "A · 带 thinking", true),
        runThinkScenarioB(client, body, "B · 不带 thinking", null),
        runThinkScenarioB(client, body, "B · 带 thinking (budget=500)", B_THINKING),
      ]);
      ctx.status = 200;
      ctx.type = "application/json; charset=utf-8";
      ctx.body = JSON.stringify(shapeThinkScenarios(aOff, aOn, bOff, bOn), null, 2);
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/think-compare: 4 组完成`,
      );
    } catch (err: unknown) {
      writeUpstreamError(ctx, err);
    }
  });
}
