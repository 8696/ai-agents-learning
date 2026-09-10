/**
 * 职责：POST /api/agent/todo-assistant —— todo 助手端到端 + 业务选型 7 闸面板（变体 8）。
 * 数据流：启 AbortController + 包 runLoop 成 promise 不 await + registerRun → 立刻 202 + runId。
 *   前端轮询 GET /api/agent/todo-run-status/:runId 拿结果；
 *   用户中途取消 → POST /api/cancel/:runId → controller.abort() → runLoop break。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件；fire-and-forget 模式让 user_cancel 闸真正可见。
 *
 * 业务选型面板：默认 7 闸全开；勾掉某几闸模拟「按业务选装」（如「最少 4 道」只装变体 1/2/3/4）。
 *
 * todo 助手业务：真调模型，让模型按 system prompt 调 queryTodo 查 T001~T010 共 10 个 todo，
 *   每步查 1 个，最后输出 final_answer 总结——这是真循环 10 次的端到端 demo（不是「直接给总结」）。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { registerRun, finalizeRun, setRunProgress } from "./runs.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const query = z.object({
  query: z.string().min(1).max(500).default("项目：电商购物助手。需要查所有未完成 todo（status=pending）并给出最终建议（最多 100 字总结）。"),
  maxSteps: z.coerce.number().int().positive().max(1000).default(15),
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(60000),
  tokenBudget: z.coerce.number().int().positive().max(1_000_000).default(5000),
  flakyRate: z.coerce.number().min(0).max(1).default(0.1),
  toolMaxRetries: z.coerce.number().int().nonnegative().max(10).default(3),
  loopDetectionWindow: z.coerce.number().int().positive().max(10).default(3),
  // 业务选型：哪些闸装
  enableMaxSteps: z.coerce.boolean().default(true),
  enableTimeout: z.coerce.boolean().default(true),
  enableModelStop: z.coerce.boolean().default(true),
  enableUserCancel: z.coerce.boolean().default(true),
  enableToolRetry: z.coerce.boolean().default(true),
  enableToolLoop: z.coerce.boolean().default(true),
  enableTokenBudget: z.coerce.boolean().default(true),
});

export function mountTodoAssistantRoutes(router: Router): void {
  router.post("/api/agent/todo-assistant", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const p = parsed.data;
    const enabledGates: string[] = [];
    if (p.enableMaxSteps) enabledGates.push(`max=${p.maxSteps}`);
    if (p.enableTimeout) enabledGates.push(`timeout=${p.timeoutMs}ms`);
    if (p.enableModelStop) enabledGates.push("model_stop");
    if (p.enableUserCancel) enabledGates.push("user_cancel");
    if (p.enableToolRetry) enabledGates.push(`tool_retry=${p.toolMaxRetries}次`);
    if (p.enableToolLoop) enabledGates.push(`tool_loop=${p.loopDetectionWindow}次`);
    if (p.enableTokenBudget) enabledGates.push(`token_budget=${p.tokenBudget}`);

    const controller = new AbortController();
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const promise = (async () => {
      try {
        const out = await runLoop({
          enableMaxStepsGate: p.enableMaxSteps,
          maxSteps: p.maxSteps,
          enableTimeoutGate: p.enableTimeout,
          timeoutMs: p.timeoutMs,
          enableModelStopGate: p.enableModelStop,
          enableUserCancelGate: p.enableUserCancel,
          enableToolRetryGate: p.enableToolRetry,
          toolMaxRetries: p.toolMaxRetries,
          flakyRate: p.flakyRate,
          alwaysFail: false,
          enableToolCallLoopGate: p.enableToolLoop,
          loopDetectionWindow: p.loopDetectionWindow,
          enableTokenBudgetGate: p.enableTokenBudget,
          tokenBudget: p.tokenBudget,
          useRealLlm: true,
          query: p.query,
          mockStopAt: 0,
          latencyMsPerStep: 200,
          hardCap: HARD_CAP,
          label: `todo 助手端到端（装了 ${enabledGates.length} 闸）`,
          abortSignal: controller.signal,
          // 实时进度：loop.ts 每步调一次 → setRunProgress → 前端 GET run-status 时拿到
          onProgress: (progress) => setRunProgress(runId, progress),
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
      "路由-todo-assistant",
      "调用函数开始：POST /api/agent/todo-assistant",
      "为什么写这条日志：todo 助手端到端入口；fire-and-forget 让 user_cancel 闸可触发。当前：runId=" + runId + " · 装了 " + enabledGates.join(" · "),
      { 入参: p, __code: "registerRun + ctx.status = 202" },
    );
    ctx.status = 202;
    ctx.body = { runId, status: "running", enabledGatesCount: enabledGates.length, hint: "POST /api/cancel/:runId 中途取消；GET /api/agent/todo-run-status/:runId 拿结果" };
  });
}