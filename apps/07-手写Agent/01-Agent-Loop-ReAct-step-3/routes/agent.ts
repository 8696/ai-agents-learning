/**
 * 职责：POST /api/agent-run —— 跑一整轮 Agent Loop，把 trajectory + 最终答案 + 数据前后对照返回给前端。
 *
 * 数据流：
 *   浏览器 fetch { query: "把逾期购物待办标完成" }
 *     → Zod 校验（query 非空字符串）
 *       → 取 llm 客户端
 *         → snapshotTodos() 当 todosBefore
 *           → runAgentLoop({ messages: [system, user(query)], ... })
 *             → 完整 trajectory + finalAnswer + stoppedReason + finalMessages
 *               → snapshotTodos() 当 todosAfter → diff(before, after) 只列 changed rows
 *                 → 返回前端按圈展开 + 数据前后对照
 *
 * 教学锚点（step-1 增强）：
 *   - 前端看到的「按圈展开」= 后端 trajectory 一对一渲染
 *   - system 提示给模型「你有两个 tool：list_todos / complete_todo」，让本 demo 必走多圈（变体 D）
 *   - finalMessages 完整保留给前端展示「跑完后 messages 长什么样」（变体 H 直观感受）
 *   - todosBefore / todosAfter / diff ——「Loop 在改数据」肉眼可见；不变的就只展示一次
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";
import { runAgentLoop, type ChatMessage } from "../lib/flow/loop.js";
import { snapshotTodos, type Todo } from "../lib/tools/todo-data.js";

const bodySchema = z.object({
  query: z.string().min(1, "query 不能为空"),
});

/**
 * 计算两个 todo 快照之间的 diff：仅返回字段不同的行 + summary。
 * 当前 step-1 只有 done 会变；后续 step 加 Tool 时如果改别的字段，diff 自然兼容。
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

export function mountAgentRoutes(router: Router): void {
  router.post("/api/agent-run", async (ctx: Context) => {
    // ── ① 入参校验：防 malformed body（类 A · 4xx）──
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

    // ── ② 取 LLM 客户端（缺 Key 直接 502 类 B）──
    let llm;
    try {
      llm = getLlm();
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("agent-run.no_llm", "调用函数结束：agent-run（失败）",
        "为什么打：getLlm 抛错；apps/.env 没配当前提供商的 Key。当前：路由直接回 502。",
        { error: err });
      return;
    }

    // ── ②.5 Loop 跑之前快照内存数据（让前端看见「之前 vs 之后」）──
    const todosBefore = snapshotTodos();

    logger.info("agent-run.handler", "调用函数开始：agent-run",
      "为什么打：本条教学点 = 一整圈 Loop 在转；不打完整 trajectory，下面就讲不清「Reason/Act/Observe 怎么流动」。当前：拿到 query，即将 runAgentLoop。",
      {
        入参: { query },
        本轮为什么是这些参数: {
          query: "前端用户在输入框写的自然语言",
          system: "固定 SYSTEM_PROMPT（告诉模型有什么工具 + 多步思路）",
          todosBeforeCount: todosBefore.length,
        },
        __code: "const result = await runAgentLoop({...});",
      });

    const t0 = Date.now();
    try {
      const initialMessages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ];
      const result = await runAgentLoop({
        openai: llm.openai,
        model: llm.modelA,
        initialMessages,
        maxRounds: 6,
      });

      // ── ②.6 Loop 跑完后再次快照 → diff ──
      const todosAfter = snapshotTodos();
      const diff = diffTodos(todosBefore, todosAfter);

      logger.info("agent-run.handler", "调用函数结束：agent-run",
        "为什么打：要把 trajectory + finalAnswer + 数据前后对照 回前端；不打前端怎么画图。当前：Loop 已退出。",
        {
          返回值: {
            trajectory: result.trajectory,
            finalAnswer: result.finalAnswer,
            stoppedReason: result.stoppedReason,
            rounds: result.rounds,
            diff,
          },
          字段释义: {
            "trajectory": "每一圈的轨迹：assistant 摘要 + tool_calls + toolResults + 耗时",
            "finalAnswer": "最后一圈 assistant 的正文（最终答案 · 变体 J）",
            "stoppedReason": "final_answer（本圈没 tool_calls）/ max_rounds（兜底触发）",
            "rounds": "实际跑了几圈",
            "diff.changed": "before / after 字段不一致的 todo；只有这些行才进前端 diff 视图",
            "diff.summary.completedCount": "从 done=false 翻成 done=true 的条数（最常见的「Loop 改动」）",
            "diff.summary.otherChanges": "其它字段变化的条数（本 step 0，因为只有 done 会变）",
          },
          耗时ms: Date.now() - t0,
        });

      ctx.body = {
        query,
        trajectory: result.trajectory,
        finalAnswer: result.finalAnswer,
        stoppedReason: result.stoppedReason,
        rounds: result.rounds,
        finalMessages: result.finalMessages,
        todosBefore,
        todosAfter,
        diff,
      };
    } catch (err: unknown) {
      logger.error("agent-run.handler", "调用函数结束：agent-run（失败）",
        "为什么打：模型调用本身抛错（限流 / 网络 / 超时）；不让 Loop 静默死。当前：路由回 502。",
        { error: err, 耗时ms: Date.now() - t0 });
      ctx.status = 502;
      ctx.body = {
        error: "upstream_failed",
        message: (err as Error).message,
      };
    }
  });
}
