/**
 * 职责：POST /api/agent/always-fail —— 工具重试上限闸（变体 5 · 100% 失败端点 · 演示降级）。
 * 数据流：mock 工具 alwaysFail=true 永远失败；闸门 5 重试 toolMaxRetries 次全失败后 → stoppedReason=tool_retry_cap + toolUnavailable=true。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件；和 with-retry 对照演示「重试成功 vs 全部失败降级」。
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
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(100),
  toolMaxRetries: z.coerce.number().int().nonnegative().max(10).default(3),
});

export function mountAlwaysFailRoutes(router: Router): void {
  router.post("/api/agent/always-fail", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { query: task, maxSteps, latencyMsPerStep, toolMaxRetries } = parsed.data;
    const t0 = Date.now();
    logger.info("路由-always-fail", "调用函数开始：POST /api/agent/always-fail", "演示工具重试上限闸（变体 5 · 100% 失败）；闸门 5 重试 toolMaxRetries 次全失败后降级。当前：toolMaxRetries=" + toolMaxRetries, { 入参: { query: task, maxSteps, latencyMsPerStep, toolMaxRetries }, __code: "await runLoop({...})" });
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: false,
      timeoutMs: 0,
      enableModelStopGate: true,
      enableUserCancelGate: false,
      enableToolRetryGate: true,
      toolMaxRetries,
      flakyRate: 0,
      alwaysFail: true,
      useRealLlm: true,
      query: task,
      mockStopAt: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `工具重试上限 闸（alwaysFail · 重试上限=${toolMaxRetries}）`,
      abortSignal: null,
    });
    ctx.body = out;
    logger.info("路由-always-fail", "调用函数结束：POST /api/agent/always-fail", "收口；前端要把 stoppedReason=tool_retry_cap + summary.toolUnavailable 亮出来。", { 返回值: { stepCount: out.stepCount, stoppedReason: out.stoppedReason, toolCallCount: out.toolCallCount, toolFailureCount: out.toolFailureCount, toolUnavailable: out.summary.toolUnavailable, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 });
  });
}