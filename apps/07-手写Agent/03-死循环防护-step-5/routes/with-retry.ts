/**
 * 职责：POST /api/agent/with-retry —— 工具重试上限闸（变体 5 · 偶发失败端点）。
 * 数据流：mock 工具按 flakyRate 概率失败；闸门 5 最多重试 toolMaxRetries 次；都失败就 stoppedReason=tool_retry_cap。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const query = z.object({
  query: z.string().min(1).max(500).default("查 SKU-001 / SKU-002 / SKU-003 的库存，完成后输出 final_answer"),
  maxSteps: z.coerce.number().int().positive().max(1000).default(10),
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(30000),
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(100),
  flakyRate: z.coerce.number().min(0).max(1).default(0.5),
  toolMaxRetries: z.coerce.number().int().nonnegative().max(10).default(3),
});

export function mountWithRetryRoutes(router: Router): void {
  router.post("/api/agent/with-retry", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { query: task, maxSteps, timeoutMs, latencyMsPerStep, flakyRate, toolMaxRetries } = parsed.data;
    const t0 = Date.now();
    logger.info("路由-with-retry", "调用函数开始：POST /api/agent/with-retry", "演示工具重试上限闸（变体 5 · 偶发失败）；真模型 + mock 工具按 flakyRate 失败。当前：flakyRate=" + flakyRate + " · toolMaxRetries=" + toolMaxRetries, { 入参: { query: task, maxSteps, timeoutMs, latencyMsPerStep, flakyRate, toolMaxRetries }, __code: "await runLoop({...})" });
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: true,
      timeoutMs,
      enableModelStopGate: true,
      enableUserCancelGate: false,
      enableToolRetryGate: true,
      toolMaxRetries,
      flakyRate,
      alwaysFail: false,
      useRealLlm: true,
      query: task,
      mockStopAt: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `工具重试上限 闸（flakyRate=${flakyRate} · 重试上限=${toolMaxRetries}）`,
      abortSignal: null,
    });
    ctx.body = out;
    logger.info("路由-with-retry", "调用函数结束：POST /api/agent/with-retry", "收口；前端要把 toolCallCount / toolFailureCount / toolRetrySuccessCount 三个数字亮出来。", { 返回值: { stepCount: out.stepCount, stoppedReason: out.stoppedReason, toolCallCount: out.toolCallCount, toolFailureCount: out.toolFailureCount, toolRetrySuccessCount: out.toolRetrySuccessCount, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 });
  });
}