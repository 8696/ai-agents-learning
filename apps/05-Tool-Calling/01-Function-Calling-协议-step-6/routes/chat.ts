/**
 * 职责：POST /api/chat —— 真调 LLM（协议 A），完整两轮 + 服务端 detectHallucination。
 *
 * 数据流：
 *   POST { input } →
 *     round-1: messages=[user] + tools=[3 项 Registry 派生] + tool_choice="auto"
 *       → callProtocolA(req1) → resp1
 *     execute: toolCallsFromLLM → executeTool() → tool_results
 *     detectHallucination(finalReply, toolResults) → { isHallucinated, sourceNumbers, replyNumbers, fakeNumbers }
 *     round-2: messages=[user, assistant(tool_calls), tool, tool, ...]
 *       → callProtocolA(req2) → resp2 (final_reply)
 *     ctx.body = { user_input, round_1, tool_results, round_2, final_reply, hallucination }
 *
 * step-6 vs step-2：
 *   - 路由骨架一致（两轮调用 + execute + 回灌）
 *   - step-6 新增：finalReply 调 detectHallucination → 把 reply 数字 vs tool_result 数字差异自动列出
 *   - 前端 public/index.html 把所有 4 张卡（Round 1 Request/Response + Round 2 Request/Response）
 *     + 编造检测栏摆出来，让学习者看见协议层 + "模型有没有编" 两件事
 *
 * 日志（§5.3.16）：chat.* + llm.* + detect.* 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, type ExecResult } from "../lib/tools/registry.js";
import { callProtocolA, type ProtocolARequest, type ProtocolAResponse, type ChatMsg } from "../lib/llm/protocol-a.js";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

// ── 当前进程用的模型 id（启动时拿一次；缺 Key 这里抛，路由层不会进）──
let cachedModelA = "";
try {
  cachedModelA = getLlm().modelA;
} catch {
  cachedModelA = "(未配置)";
}

// ── 派生当前 Registry 的 tools schema（OpenAI 格式）──
const TOOLS_SCHEMA = getToolsForLLM().map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

// ── 编造检测（核心新增）──
// 从 tool_result.ok 的 result 对象里 flatten 所有数字 → sourceNumbers；
// 从 reply 里精准提取"可被引用的数字"（¥ 后面的钱 / °C 前面的温度）→ replyNumbers；
// fakeNumbers = replyNumbers \ sourceNumbers；isHallucinated = fakeNumbers 非空。
function extractNumbers(v: unknown, acc: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) acc.push(v);
  else if (Array.isArray(v)) for (const item of v) extractNumbers(item, acc);
  else if (v && typeof v === "object") for (const val of Object.values(v as Record<string, unknown>)) extractNumbers(val, acc);
  return acc;
}

function detectHallucination(reply: string, results: ExecResult[]): {
  isHallucinated: boolean;
  sourceNumbers: number[];
  replyNumbers: number[];
  fakeNumbers: number[];
} {
  const sourceNumbers: number[] = [];
  for (const r of results) {
    if (r.ok) extractNumbers(r.result, sourceNumbers);
  }
  const sourceSet = new Set(sourceNumbers);

  const replyNumbers: number[] = [];
  // 钱：¥ 后面的数字（"¥3500" → 3500）
  const moneyRe = /¥\s*(-?\d+(?:\.\d+)?)/g;
  // 温度：`25℃`（一个字符 摄氏度）和 `25°C`（度数符号 + C）两种写法都覆盖
  const tempRe = /(-?\d+(?:\.\d+)?)\s*(?:°\s*C|℃)/g;
  let mm: RegExpExecArray | null;
  while ((mm = moneyRe.exec(reply)) !== null) {
    const n = Number(mm[1]);
    if (Number.isFinite(n)) replyNumbers.push(n);
  }
  while ((mm = tempRe.exec(reply)) !== null) {
    const n = Number(mm[1]);
    if (Number.isFinite(n)) replyNumbers.push(n);
  }

  const fakeNumbers: number[] = [];
  for (const n of replyNumbers) {
    if (!sourceSet.has(n)) fakeNumbers.push(n);
  }
  return { isHallucinated: fakeNumbers.length > 0, sourceNumbers, replyNumbers, fakeNumbers };
}

// ── 一次 LLM 调用 + 兜底 ──
type CallResult =
  | { ok: true; request: ProtocolARequest; response: ProtocolAResponse }
  | { ok: false; request: ProtocolARequest; error: string; upstreamStatus?: number };

async function callLlmOnce(messages: ChatMsg[]): Promise<CallResult> {
  let modelId = cachedModelA;
  if (modelId === "(未配置)") {
    try {
      modelId = getLlm().modelA;
      cachedModelA = modelId;
    } catch (err: unknown) {
      logger.error("chat.no-key", "未配置 LLM Key", "apps/.env 没配当前 provider 的 Key；这是阻塞性错误必须立刻告诉用户怎么修", { err: err instanceof Error ? err.message : String(err) });
      return {
        ok: false,
        request: { model: "?", messages, tools: TOOLS_SCHEMA, tool_choice: "auto" },
        error: "未配置 LLM Key：" + (err instanceof Error ? err.message : String(err)),
      };
    }
  }

  const request: ProtocolARequest = {
    model: modelId,
    messages,
    tools: TOOLS_SCHEMA,
    tool_choice: "auto",
  };

  try {
    const response = await callProtocolA(request);
    logger.info("llm.response", "← got response", "调模型返；记 choices / finishReason / usage", {
      finishReason: response.choices[0]?.finish_reason,
      toolCallCount: response.choices[0]?.message?.tool_calls?.length ?? 0,
      usage: response.usage,
    });
    return { ok: true, request, response };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    const upstreamStatus = e.status;
    const msg = e.error?.message || e.message || String(err);
    logger.error("llm.error", "callProtocolA threw", "协议 A 抛异常", { upstreamStatus, err: msg });
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

// ── 路由 ──
export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    logger.info("chat.received", "POST /api/chat", "前端发来用户输入；step-6 演示协议层数据形态 + 编造检测", { input, inputLen: input.length });

    if (!input) {
      logger.warn("chat.bad-input", "input empty", "用户输入是空字符串", { body });
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    // ── Round 1 ──
    const messages1: ChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1);
    if (!r1.ok) {
      logger.error("chat.round-1.fail", "round-1 failed → 502", "Round 1 调模型失败", { error: r1.error, upstreamStatus: r1.upstreamStatus });
      ctx.status = 502;
      ctx.body = { error: r1.error, upstream_status: r1.upstreamStatus, round_1: r1 };
      return;
    }
    const assistantMsg1 = r1.response.choices[0].message;
    const toolCallsFromLLM = assistantMsg1.tool_calls ?? [];
    logger.info("chat.round-1.ok", "round-1 decided", "Round 1 模型决定", {
      finishReason: r1.response.choices[0].finish_reason,
      toolCallCount: toolCallsFromLLM.length,
      toolCallNames: toolCallsFromLLM.map((tc) => tc.function.name),
    });

    // ── Execute：每个 tool_call 过 Registry ──
    const toolResults: ExecResult[] = toolCallsFromLLM.map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        logger.warn("chat.execute.parse-fail", "tool_call.arguments 不是合法 JSON", "模型生成了非 JSON 的 arguments", {
          id: tc.id, name: tc.function.name, raw: tc.function.arguments,
        });
        return {
          ok: false,
          tool: tc.function.name,
          tool_call_id: tc.id,
          error: "tool_call.arguments 不是合法 JSON：" + tc.function.arguments,
        };
      }
      const r = executeTool(tc.function.name, args, tc.id);
      logger.info("chat.execute.result", "tool_result", "工具执行完", {
        id: tc.id, name: tc.function.name, ok: r.ok,
      });
      return r;
    });

    // 模型可能直接回自然语言（不调工具）
    if (toolCallsFromLLM.length === 0) {
      const directReply = assistantMsg1.content ?? "";
      // 即使没调工具，也跑编造检测（reply 数字 vs 空源集）
      const hallucination = detectHallucination(directReply, []);
      logger.info("chat.no-tool-call", "model 直接自然语言答", "模型没调工具；跑编造检测（源集为空 → 任何 reply 数字都是 fake）", {
        contentPreview: directReply.slice(0, 80),
        hallucinated: hallucination.isHallucinated,
      });
      ctx.body = {
        user_input: input,
        round_1: r1,
        model_tool_calls: [],
        tool_results: [],
        final_reply: directReply,
        hallucination,
      };
      return;
    }

    // ── Round 2：回灌 tool_result 让模型生成 final_reply ──
    const toolMessages: ChatMsg[] = toolResults.map((r) => ({
      role: "tool",
      tool_call_id: r.tool_call_id,
      content: JSON.stringify(r.ok ? r.result : { error: r.error }),
    }));
    const messages2: ChatMsg[] = [
      ...messages1,
      {
        role: "assistant",
        content: assistantMsg1.content,
        tool_calls: toolCallsFromLLM,
      },
      ...toolMessages,
    ];
    const r2 = await callLlmOnce(messages2);
    if (!r2.ok) {
      logger.error("chat.round-2.fail", "round-2 failed → 502", "Round 2 失败", { error: r2.error, upstreamStatus: r2.upstreamStatus });
      ctx.status = 502;
      ctx.body = {
        error: r2.error,
        upstream_status: r2.upstreamStatus,
        round_1: r1,
        model_tool_calls: toolCallsFromLLM,
        tool_results: toolResults,
        round_2: r2,
      };
      return;
    }
    const finalReply = r2.response.choices[0].message.content ?? "";
    logger.info("chat.round-2.ok", "round-2 done", "Round 2 成功", {
      finishReason: r2.response.choices[0].finish_reason,
      finalLen: finalReply.length,
    });

    // ── 编造检测（核心新增）：扫 reply 数字 vs tool_result 数字 ──
    const hallucination = detectHallucination(finalReply, toolResults);
    logger.info("detect.hallucination", "扫 reply 数字 vs tool_result 数字", "step-6 核心：让 reply 是否引用 tool_result 在页面上自动可见", {
      isHallucinated: hallucination.isHallucinated,
      sourceCount: hallucination.sourceNumbers.length,
      replyCount: hallucination.replyNumbers.length,
      fakeNumbers: hallucination.fakeNumbers,
    });

    ctx.body = {
      user_input: input,
      round_1: r1,
      model_tool_calls: toolCallsFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalReply,
      hallucination,
    };
    logger.info("chat.reply.sent", "responded to client", "已返回；含 4 张数据卡 + 编造检测", { status: 200 });
  });
}
