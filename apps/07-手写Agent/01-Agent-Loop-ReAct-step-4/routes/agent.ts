/**
 * 职责：step-4 「变体 M 用户取消」的两个端点。
 *
 *   POST /api/agent-run               → 202 + { runId, startedAt }，**不等** loop 跑完
 *     内部流程：Zod 校验 query → 取 llm → newRunId + AbortController
 *               → registerRun(runId, controller) + 存 todosBefore
 *               → async 启动 runAgentLoop({ ..., signal: controller.signal })
 *                 → try/catch 兜住 → finishRun / errorRun 收尾
 *                 → 不让任何异常冒到 router；异常时 errorRun 让前端轮询拿到 502
 *
 *   GET /api/agent-run/:runId         → running 返 202；done / cancelled 返 200 完整 result；
 *                                       error 返 502；不存在返 404
 *     内部流程：getRun(runId) → 判定 status → 返回
 *               done / cancelled 时：snapshotTodos() 当 after → diff(before, after)
 *               cancelled 时 result.trajectory 仍完整保留（变体 M 教学点）
 *
 * 教学锚点（变体 M）：
 *   - POST 立刻返 202 是关键 —— 不阻塞 HTTP 连接；取消按钮才能在浏览器侧立刻生效
 *   - GET 轮询（800ms）让前端不需要 SSE / WebSocket；复杂度可控
 *   - 「取消」= 触发 AbortController.abort() → 下一次 LLM 调用抛 AbortError → loop 收尾
 *
 * 不在 step-4：L 超时（Promise.race）、变体 K 主教学点（MAX 当主出口，非兜底）—— 留后续。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";
import { runAgentLoop, type ChatMessage } from "../lib/flow/loop.js";
import { snapshotTodos, type Todo } from "../lib/tools/todo-data.js";
import {
  newRunId,
  registerRun,
  getRun,
  finishRun,
  errorRun,
} from "../lib/cancellation.js";

const bodySchema = z.object({
  query: z.string().min(1, "query 不能为空"),
});

/**
 * 计算两个 todo 快照之间的 diff：仅返回字段不同的行 + summary。
 * 沿用 step-3 实现（接口兼容；后续 step 加 Tool 时如果改别的字段，diff 自然兼容）。
 */
function diffTodos(before: Todo[], after: Todo[]): {
  changed: Array<{ id: string; title: string; tag: string; from: Todo; to: Todo }>;
  summary: { completedCount: number; otherChanges: number };
} {
  const beforeMap = new Map(before.map((t) => [t.id, t]));
  const changed: Array<{ id: string; title: string; tag: string; from: Todo; to: Todo }> = [];
  let completedCount = 0;
  let otherChanges = 0;
  for (const a of after) {
    const b = beforeMap.get(a.id);
    if (!b) continue;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changed.push({ id: a.id, title: a.title, tag: a.tag, from: b, to: a });
      if (!b.done && a.done) completedCount += 1;
      else otherChanges += 1;
    }
  }
  return { changed, summary: { completedCount, otherChanges } };
}

const SYSTEM_PROMPT =
  "你是一个待办助手。可以调 list_todos（看列表 / 按 tag 过滤 / 仅逾期）和 complete_todo（标记完成）。" +
  "**重要：tool 返回错误时（如 not_found），你必须从错误信息学 —— 下一圈用 list_todos 查正确 id 再调 complete_todo，不要重复同样的错。**" +
  "当所有该标的都标完了，正文给出最终答案（不再调工具）。";

/** runId → 跑前 todo 快照：cancellation.ts 不放业务数据，由 routes/agent.ts 自己存 */
const TODOS_BEFORE = new Map<string, Todo[]>();
/** runId → query：GET 返回时拿给前端做展示 */
const RUN_QUERY = new Map<string, string>();

export function mountAgentRoutes(router: Router): void {
  // ──────────── POST /api/agent-run：立刻返 202 + runId（step-4 关键改动）────────────
  router.post("/api/agent-run", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("agent-run.bad_request", "调用函数结束：agent-run（失败）",
        "为什么打：入参 Zod 没通过；返回 400 让前端黄字。当前：body 缺 query 或 query 空。",
        { issues: parsed.error.issues });
      return;
    }
    const { query } = parsed.data;

    let llm;
    try {
      llm = getLlm();
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("agent-run.no_llm", "调用函数结束：agent-run（失败）",
        "为什么打：getLlm 抛错；apps/.env 没配当前提供商的 Key。当前：路由直接回 502（不走取消流程）。",
        { error: err });
      return;
    }

    // ── 准备 runId + controller + 快照 ──
    const todosBefore = snapshotTodos();
    const runId = newRunId();
    const controller = new AbortController();
    registerRun(runId, controller);
    TODOS_BEFORE.set(runId, todosBefore);
    RUN_QUERY.set(runId, query);

    logger.info("agent-run.started", "调用函数开始：agent-run（异步）",
      "为什么打：step-4 教学点 = 「立刻返 202 + 异步跑 loop」；不打这条讲不清「取消为什么能立刻生效」。当前：runId 注册到 cancellation，loop 异步启动。",
      {
        runId,
        入参: { query },
        本轮为什么是这些参数: {
          query: "前端用户在输入框写的自然语言",
          system: "固定 SYSTEM_PROMPT（告诉模型有什么工具 + 多步思路）",
          signal: "AbortSignal 来自新 controller；routes/cancel.ts 调 abort() → 下一次 LLM 抛 AbortError → loop 退出",
          todosBeforeCount: todosBefore.length,
        },
        __code: "void runAgentLoopInBackground(); return 202;",
      });

    // ── 异步启动 loop（**不 await**）──
    void runAgentLoopInBackground({
      openai: llm.openai,
      model: llm.modelA,
      runId,
      query,
      todosBefore,
    });

    ctx.status = 202;
    ctx.body = {
      runId,
      startedAt: new Date().toISOString(),
      query,
    };
  });

  // ──────────── GET /api/agent-run/:runId：轮询端点 ────────────
  router.get("/api/agent-run/:runId", async (ctx: Context) => {
    const { runId } = ctx.params;
    const run = getRun(runId);
    if (!run) {
      ctx.status = 404;
      ctx.body = { error: "run_not_found", runId };
      return;
    }
    const query = RUN_QUERY.get(runId) ?? "";

    // ── 状态：running → 返 202 + 进度信息 ──
    if (run.status === "running") {
      ctx.status = 202;
      ctx.body = {
        status: "running" as const,
        runId,
        query,
        startedAt: new Date(run.startedAt).toISOString(),
        elapsedMs: Date.now() - run.startedAt,
      };
      return;
    }

    // ── 状态：error → 返 502（不入 trajectory）──
    if (run.status === "error") {
      ctx.status = 502;
      ctx.body = {
        error: run.error?.error ?? "upstream_failed",
        message: run.error?.message ?? "Loop 中上游失败",
        runId,
      };
      return;
    }

    // ── 状态：done / cancelled → 返 200 完整 result ──
    // 注意：cancelled 时 trajectory 仍完整保留（变体 M 教学点 —— 用户能看到跑到第几圈被取消）
    const todosBefore = TODOS_BEFORE.get(runId) ?? [];
    const todosAfter = snapshotTodos();
    const diff = diffTodos(todosBefore, todosAfter);

    logger.info("agent-run.polled.done", "调用函数结束：agent-run（轮询拿到结果）",
      "为什么打：前端轮询拿到结果时记一笔；不讲清这一步，「前端怎么知道取消成功」看不出来。当前：status=done/cancelled，返回 result。",
      {
        runId,
        返回值: {
          status: run.status,
          stoppedReason: run.result?.stoppedReason,
          rounds: run.result?.rounds,
        },
        字段释义: {
          "status": "done / cancelled —— 都不会再变",
          "stoppedReason": "final_answer / max_rounds / cancelled（变体 M 主出口）",
        },
      });

    ctx.status = 200;
    ctx.body = {
      status: run.status,
      runId,
      query,
      trajectory: run.result?.trajectory ?? [],
      finalAnswer: run.result?.finalAnswer ?? "",
      stoppedReason: run.result?.stoppedReason ?? "final_answer",
      rounds: run.result?.rounds ?? 0,
      finalMessages: run.result?.finalMessages ?? [],
      todosBefore,
      todosAfter,
      diff,
      startedAt: new Date(run.startedAt).toISOString(),
      endedAt: run.endedAt ? new Date(run.endedAt).toISOString() : null,
    };

    // ── 一次性：跑完后清掉缓存（防止 Map 无限增长）──
    TODOS_BEFORE.delete(runId);
    RUN_QUERY.delete(runId);
  });
}

/**
 * 后台跑 loop 的闭包：try/catch 兜住 → finishRun / errorRun 收尾。
 * 永远不抛错 —— 任何异常都由 errorRun 转成 status=error 让前端轮询拿到 502。
 */
async function runAgentLoopInBackground(args: {
  openai: import("openai").default;
  model: string;
  runId: string;
  query: string;
  todosBefore: Todo[];
}): Promise<void> {
  const { openai, model, runId, query } = args;
  const initialMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: query },
  ];
  try {
    const result = await runAgentLoop({
      openai,
      model,
      initialMessages,
      maxRounds: 6,
      signal: getRun(runId)?.controller.signal,
    });
    finishRun(runId, result);
  } catch (err: unknown) {
    logger.error("agent-run.background", "调用函数结束：后台 loop（失败）",
      "为什么打：async 启动的 loop 抛错（不在 LLM signal 路径上）；不能让前端永远拿到 202。",
      { runId, error: err });
    errorRun(runId, {
      error: "upstream_failed",
      message: (err as Error).message || "Loop 中上游失败",
    });
  }
}