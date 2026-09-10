/**
 * 职责：POST /api/self-correct —— 模型自编排链场景（对应 pages/self-correct.html）。
 * 数据流：
 *   POST { query } →
 *     while (rounds < MAX) {
 *       ① 决策：decideNextAction(round, query, lastResult) → 模拟 LLM 看 tool_result 决定下一步
 *       ② 如果 kind === "final" → 退出循环，返 final content
 *       ③ 如果 kind === "tool_call" → executeTool() → 记 stepTrace
 *       ④ lastResult = 当前轮结果 → 下一轮模型看到
 *     }
 *     返 { query, trace: [{round, decision, result, startMs, endMs}, ...], totalMs, finalReply, maxRoundsTriggered }
 *
 * step-5 vs step-4：step-4 路由层 hard-code A → B（2 步固定）；step-5 是 while 循环 + 模型决策。
 *   - 每轮由 decideNextAction mock 函数决定（实际生产 = LLM 调 llm.chat({messages, tools})）
 *   - 自纠：search_doc 返空 hits → 模型换 query → 重试
 *   - MAX_ROUNDS 边界：防止模型无限调
 *
 * 与 routes/chain.ts (step-4) 的关系：本路由服务"自纠"场景（pages/self-correct.html）；
 *   step-4 的 chain 是路由层 hard-code 链 A → B；step-5 是 while 循环 + 模型决策。
 *   **页与接口 1:1**（§5.3.8）。
 *
 * 教学锚点（覆盖 MD 例子 5.5 + 错误恢复闭环）：
 *   - while + finish_reason 循环骨架
 *   - 模型自纠：空 tool_result → 换 query → 重试（看 trace[1] 怎么触发 trace[2]）
 *   - MAX_ROUNDS 边界：超 4 轮未收敛 → final 报 MAX_REACHED
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostSelfCorrect 封装层）；
 *   校验挡下单独写 warn；子调用 decideNextAction / executeTool 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  executeTool,
  getToolsMeta,
  decideNextAction,
  type Decision,
  type ExecResult,
} from "../lib/tools/registry.js";
import { logger } from "../lib/logger.js";

const MAX_ROUNDS = 4;  // 防止模型无限调

type RoundTrace = {
  round: number;
  decision: Decision;
  result: ExecResult;
  startMs: number;     // 相对 loop 开始的 ms
  endMs: number;
  durationMs: number;
};

// ── 路由 ──
export function mountSelfCorrectRoutes(router: Router): void {
  router.get("/api/tools", (ctx: Context) => {
    const tHandlerStart = Date.now();
    const meta = getToolsMeta();
    logger.info(
      "api.tools",
      "调用函数开始：handleGetTools",
      "为什么写这条日志：route 只认这一层返回的 { tools }；里面 getToolsMeta 是真正干活的那一层。当前：前端 Tool Registry 面板拉一次；记 count 便于核对前后端 tool schema 是否一致。",
      {
        入参: { endpoint: "GET /api/tools" },
        __code: `ctx.body = { tools: getToolsMeta() };`,
      },
    );
    ctx.body = { tools: meta };
    logger.info(
      "api.tools",
      "调用函数结束：handleGetTools",
      "为什么写这条日志：route 要把 { tools } 写进 ctx.body 交给前端 Registry 面板。",
      {
        返回值: { count: meta.length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });

  router.post("/api/self-correct", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const body = (ctx.request.body ?? {}) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    logger.info(
      "api.self-correct",
      "调用函数开始：handlePostSelfCorrect",
      "为什么写这条日志：route 只认这一层返回的 trace + finalReply；里面 while + decideNextAction + executeTool 是真正干活的那一层。当前：前端发来自纠请求；记 query 便于核对。",
      {
        入参: { queryPreview: query.slice(0, 60), queryLen: query.length, bodyKeys: Object.keys(body) },
        __code: `while (rounds < MAX) { const decision = decideNextAction(...); ... }`,
      },
    );

    // §5.3.12 入参校验
    if (!query) {
      logger.warn(
        "api.self-correct",
        "调用函数结束：handlePostSelfCorrect（校验拒绝）",
        "为什么写这条日志：query 不能为空；走 400 不让 while 浪费工具调用。",
        {
          返回值: { httpStatus: 400, error: "query 不能为空" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "query 不能为空" };
      return;
    }

    const loopStart = Date.now();
    const trace: RoundTrace[] = [];
    let lastResult: ExecResult | null = null;
    let finalReply: string | null = null;
    let maxRoundsTriggered = false;
    let rounds = 0;

    logger.info(
      "││ loop-self-correct",
      "调用循环开始：while 循环骨架",
      "为什么写这条日志：MAX_ROUNDS=" + MAX_ROUNDS + "；每轮由 decideNextAction 决定下一步；防模型无限调。",
      {
        maxRounds: MAX_ROUNDS,
      },
    );

    while (rounds < MAX_ROUNDS) {
      rounds++;
      const decision = decideNextAction(rounds, query, lastResult);

      // ── 终止条件 1：模型决定"够了"（kind === "final"）──
      if (decision.kind === "final") {
        logger.info(
          "││ loop-self-correct",
          `调用循环结束：第 ${rounds} 轮（final）`,
          "为什么写这条日志：模型看完 tool_result 决定不再调；退出循环。",
          {
            第几轮: rounds,
            本轮结果: { kind: "final", contentPreview: decision.content.slice(0, 50) },
          },
        );
        finalReply = decision.content;
        break;
      }

      // ── 执行 tool_call ──
      const toolCallId = decision.tool_call_id;
      logger.info(
        "││ loop-self-correct",
        `调用循环 · 第 ${rounds} 轮 · tool_call 子执行`,
        "为什么写这条日志：模型决定调工具；记 round + tool + arguments 便于回看。",
        {
          第几轮: rounds,
          本轮为什么是这些参数: { tool: decision.tool, arguments: decision.arguments },
        },
      );
      const startMs = Date.now() - loopStart;
      const r: ExecResult = await executeTool(decision.tool, decision.arguments, toolCallId);
      const endMs = Date.now() - loopStart;
      trace.push({
        round: rounds,
        decision,
        result: r,
        startMs,
        endMs,
        durationMs: endMs - startMs,
      });
      lastResult = r;
    }

    // ── 终止条件 2：MAX_ROUNDS 触发（while 退出但 finalReply 仍 null）──
    if (finalReply === null && rounds >= MAX_ROUNDS) {
      maxRoundsTriggered = true;
      finalReply = `(MAX_ROUNDS=${MAX_ROUNDS} 触发；模型未收敛。业务降级：返 structured error 让上层重试或人工介入)`;
      logger.warn(
        "││ loop-self-correct",
        "调用循环结束：MAX_ROUNDS 触发",
        "为什么写这条日志：while 退出但未 final；业务降级；记 maxRounds + rounds 便于复盘。",
        {
          第几轮: rounds,
          本轮结果: { maxRounds: MAX_ROUNDS, maxRoundsTriggered: true },
        },
      );
    }

    const totalMs = Date.now() - loopStart;
    logger.info(
      "││ loop-self-correct",
      "调用循环结束：循环收尾",
      "为什么写这条日志：记 totalMs + rounds + 是否触发 MAX_ROUNDS 便于核对。",
      {
        本轮结果: { totalMs, rounds, maxRoundsTriggered, hasFinal: Boolean(finalReply) },
      },
    );
    logger.info(
      "api.self-correct",
      "调用函数结束：handlePostSelfCorrect",
      "为什么写这条日志：route 要把 trace + finalReply 写进 ctx.body 交给页面 stats 区；记 rounds + finalLen 便于核对。",
      {
        返回值: { status: 200, totalMs, rounds, maxRoundsTriggered, traceCount: trace.length, finalLen: finalReply?.length ?? 0 },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    ctx.body = {
      query,
      trace,
      totalMs,
      finalReply,
      rounds,
      maxRoundsTriggered,
    };
  });
}