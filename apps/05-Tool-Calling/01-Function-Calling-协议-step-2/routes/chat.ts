/**
 * 职责：POST /api/chat + GET /api/tools —— 真调 LLM（协议 A），把请求/响应全量回给前端。
 * 数据流：
 *   POST { input } →
 *     round-1: [{role:"user", content:input}] → callProtocolA → 拿 tool_calls
 *     execute: 每个 tool_call → executeTool() → tool_results
 *     round-2: [user, assistant(tool_calls), tool, tool, ...] → callProtocolA → 拿 final_reply
 *     ctx.body = { user_input, round_1, model_tool_calls, tool_results, round_2, final_reply }
 *
 * step-2 是 step-1 的真 LLM 升级版（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)）：
 *   - mock decideToolCalls 换成 callProtocolA
 *   - mock buildFinalReply 换成 LLM 第二轮（callProtocolA with tool_result in messages）
 *   - execute 路径不动（Registry 是 SDK 无关中间层）
 *
 * 教学锚点：每个 LLM 调用的 request/response 都回给前端可视化；这就是协议层数据的物理形态。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, getToolsMeta, type ExecResult } from "../lib/tools/registry.js";
import { callProtocolA, type ProtocolARequest, type ProtocolAResponse, type ChatMsg, type ToolSchema } from "../lib/llm/protocol-a.js";
import { getLlm } from "../../../llm.js";

// ── 当前进程用的模型 id（启动时拿一次；缺 Key 这里抛，路由层不会进） ──
// 兜底：真没 Key 时路由层会先在 callLlmOnce 里 catch getLlm() 抛错。
let cachedModelA = "";
try {
  cachedModelA = getLlm().modelA;
} catch {
  cachedModelA = "(未配置)";
}

// ── 派生当前 Registry 的 tools schema（OpenAI 格式）──
// 每条 Tool 的 name / description / dangerous / parameters 来自 Registry
const TOOLS_SCHEMA: ToolSchema[] = getToolsForLLM().map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

// 给前端 Tool Registry 面板用（含 dangerous 标记）
const TOOLS_META = getToolsMeta();

// ── 一次 LLM 调用 + 兜底（request 始终带回去，让前端能看到"我发了什么"） ──
type CallResult =
  | { ok: true; request: ProtocolARequest; response: ProtocolAResponse }
  | { ok: false; request: ProtocolARequest; error: string; upstreamStatus?: number };

async function callLlmOnce(messages: ChatMsg[]): Promise<CallResult> {
  // ── 取模型 id；缺 Key → 返回错误而不是抛（业务层不要因为没 Key 直接挂） ──
  let modelId = cachedModelA;
  if (modelId === "(未配置)") {
    try {
      modelId = getLlm().modelA;
      cachedModelA = modelId;
    } catch (err: unknown) {
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
    tool_choice: "auto", // 让模型自己决定调不调
  };

  try {
    const response = await callProtocolA(request);
    return { ok: true, request, response };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    const upstreamStatus = e.status;
    const msg = e.error?.message || e.message || String(err);
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

// ── 路由 ──
export function mountChatRoutes(router: Router): void {
  // Tool Registry 元信息
  router.get("/api/tools", (ctx: Context) => {
    ctx.body = { tools: TOOLS_META };
  });

  // 一轮真 LLM 调用（含 tool_calls → tool_result → final_reply）
  router.post("/api/chat", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    if (!input) {
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    // ── Round 1：user msg → LLM 拿 tool_calls ──
    const messages1: ChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1);
    if (!r1.ok) {
      ctx.status = 502; // 上游 LLM 失败
      ctx.body = { error: r1.error, upstream_status: r1.upstreamStatus, round_1: r1 };
      return;
    }
    const assistantMsg1 = r1.response.choices[0].message;
    const toolCallsFromLLM = assistantMsg1.tool_calls ?? [];

    // ── Execute：每个 tool_call 过 Registry（gateway + Zod + handler） ──
    const toolResults: ExecResult[] = toolCallsFromLLM.map((tc) => {
      let args: Record<string, unknown> = {};
      // OpenAI 的 tool_calls[].function.arguments 是 JSON 字符串——常见踩坑点
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        return {
          ok: false,
          tool: tc.function.name,
          tool_call_id: tc.id,
          error: "tool_call.arguments 不是合法 JSON：" + tc.function.arguments,
        };
      }
      return executeTool(tc.function.name, args, tc.id);
    });

    // 模型可能直接回自然语言（不调工具）—— 直接返回，跳过 round-2
    if (toolCallsFromLLM.length === 0) {
      ctx.body = {
        user_input: input,
        round_1: r1,
        model_tool_calls: [],
        tool_results: [],
        final_reply: assistantMsg1.content ?? "",
      };
      return;
    }

    // ── Round 2：把 tool_result 回灌模型，让它生成最终自然语言 ──
    // messages2 = [user, assistant(tool_calls), tool(...), tool(...)]
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

    ctx.body = {
      user_input: input,
      round_1: r1,
      model_tool_calls: toolCallsFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalReply,
    };
  });
}