/**
 * 职责：POST /api/agent/run-with-cancel —— 启一个后台 run，立刻返 runId（不阻塞）。
 * 数据流：开 AbortController → 包 runLoop 成 promise 不 await → register → 立刻 202。
 *   用户另起 POST /api/cancel/:runId 中途取消；前端轮询 GET /api/agent/run-status/:runId 拿结果。
 * 为什么单独成文件：step-4 用户取消闸的启动入口；和 GET 轮询 / POST 取消是不同职责。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { registerRun, finalizeRun } from "./runs.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const query = z.object({
  query: z.string().min(1).max(500).default("查 SKU-001 / SKU-002 / SKU-003 的库存，完成后输出 final_answer"),
  maxSteps: z.coerce.number().int().positive().max(1000).default(20),
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(60000),
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(800),
});

export function mountRunWithCancelRoutes(router: Router): void {
  router.post("/api/agent/run-with-cancel", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { query: task, maxSteps, timeoutMs, latencyMsPerStep } = parsed.data;

    const controller = new AbortController();
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const promise = (async () => {
      try {
        const out = await runLoop({
          enableMaxStepsGate: true,
          maxSteps,
          enableTimeoutGate: true,
          timeoutMs,
          enableModelStopGate: true,
          enableUserCancelGate: true,
          useRealLlm: true,
          query: task,
          mockStopAt: 0,
          latencyMsPerStep,
          hardCap: HARD_CAP,
          label: `run-with-cancel（runId=${runId}）`,
          abortSignal: controller.signal,
        });
        return { ok: true as const, result: out };
      } catch (e: unknown) {
        return { ok: false as const, error: String((e as Error)?.message ?? e) };
      } finally {
        finalizeRun(runId);
      }
    })();

    registerRun(runId, controller, promise);

    logger.info(
      "路由-run-with-cancel",
      "调用函数开始：POST /api/agent/run-with-cancel",
      "为什么写这条日志：用户取消闸的启动入口；返回 runId 不等跑完。当前：runId=" + runId,
      { 入参: { runId, query: task, maxSteps, timeoutMs, latencyMsPerStep }, __code: "registerRun(runId, controller, promise); ctx.body = { runId, status: 'running' };" },
    );
    ctx.status = 202;
    ctx.body = { runId, status: "running", hint: "POST /api/cancel/:runId 可中途取消；GET /api/agent/run-status/:runId 拿结果" };
  });
}