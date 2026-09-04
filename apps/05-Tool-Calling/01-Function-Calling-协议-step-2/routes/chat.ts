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
 *
 * 日志（§5.3.16）：详细优先；每处可打点都打 —— chat.received / round-1.start|ok|fail / execute /
 *   tool-result / round-2.start|ok|fail / reply.sent / bad-input / no-tool-call。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, getToolsMeta, type ExecResult } from "../lib/tools/registry.js";
import { callProtocolA, type ProtocolARequest, type ProtocolAResponse, type ChatMsg, type ToolSchema } from "../lib/llm/protocol-a.js";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

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
    tool_choice: "auto", // 让模型自己决定调不调
  };

  logger.info("llm.request", "→ openai.chat.completions.create", "Round 1 调模型发起 chat；记录 messages 数 + __code 便于核对请求结构", {
    model: request.model,
    messagesCount: request.messages.length,
    toolsCount: request.tools?.length ?? 0,
    tool_choice: request.tool_choice,
    __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
  });

  try {
    const response = await callProtocolA(request);
    logger.info("llm.response", "← got response", "Round 1 模型返回；完整打响应便于追 SDK 行为", response);
    return { ok: true, request, response };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    const upstreamStatus = e.status;
    const msg = e.error?.message || e.message || String(err);
    logger.error("llm.error", "callProtocolA threw", "协议 A 抛异常（网络 / 5xx / 4xx）；记 upstreamStatus + 错误信息便于排错", { upstreamStatus, err: msg });
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

// ── 路由 ──
export function mountChatRoutes(router: Router): void {
  // Tool Registry 元信息
  router.get("/api/tools", (ctx: Context) => {
    logger.info("tools.list", "GET /api/tools", "前端拉工具列表；记 count 便于核对前后端 tool schema 是否一致", { count: TOOLS_META.length });
    ctx.body = { tools: TOOLS_META };
  });

  // 一轮真 LLM 调用（含 tool_calls → tool_result → final_reply）
  router.post("/api/chat", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    logger.info("chat.received", "POST /api/chat", "前端发来用户输入；记 inputLen 便于复现与防滥用", { input, inputLen: input.length });
    if (!input) {
      logger.warn("chat.bad-input", "input empty", "用户输入是空字符串；这是业务失败（不是 LLM 错），走 400 不让 round-1 浪费 token", { body });
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    // ── Round 1：user msg → LLM 拿 tool_calls ──
    const messages1: ChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1);
    if (!r1.ok) {
      logger.error("chat.round-1.fail", "round-1 failed → 502", "Round 1 调模型失败；502 返回前端；记 error + upstreamStatus 便于排错", { error: r1.error, upstreamStatus: r1.upstreamStatus });
      ctx.status = 502; // 上游 LLM 失败
      ctx.body = { error: r1.error, upstream_status: r1.upstreamStatus, round_1: r1 };
      return;
    }
    const assistantMsg1 = r1.response.choices[0].message;
    const toolCallsFromLLM = assistantMsg1.tool_calls ?? [];
    logger.info("chat.round-1.ok", "round-1 decided", "Round 1 成功；记 finishReason 让排错时知道模型选了哪条路（tool_calls / stop）", {
      finishReason: r1.response.choices[0].finish_reason,
      toolCallCount: toolCallsFromLLM.length,
      toolCallNames: toolCallsFromLLM.map((tc) => tc.function.name),
    });

    // ── Execute：每个 tool_call 过 Registry（gateway + Zod + handler） ──
    const toolResults: ExecResult[] = toolCallsFromLLM.map((tc) => {
      let args: Record<string, unknown> = {};
      // OpenAI 的 tool_calls[].function.arguments 是 JSON 字符串——常见踩坑点
      try {
        args = JSON.parse(tc.function.arguments);
        logger.info("chat.execute.parse-ok", "tool_call.arguments JSON 解析成功", "tool_call.arguments 是合法 JSON；解析成功准备 Zod 校验", {
          id: tc.id, name: tc.function.name, argsKeys: Object.keys(args),
        });
      } catch {
        logger.warn("chat.execute.parse-fail", "tool_call.arguments 不是合法 JSON", "模型生成了非 JSON 的 arguments（常见踩坑）；记 raw 让 round-2 能纠正", {
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
      logger.info("chat.execute.result", "tool_result", "工具执行完；result 摘要打，便于核对返回内容（不打全文）", {
        id: tc.id, name: tc.function.name, ok: r.ok, error: r.ok ? undefined : r.error,
      });
      return r;
    });

    // 模型可能直接回自然语言（不调工具）—— 直接返回，跳过 round-2
    if (toolCallsFromLLM.length === 0) {
      logger.info("chat.no-tool-call", "model returned natural language, skip round-2", "模型没调工具、直接自然语言答；这种情况跳过 round-2 直接返回 final 节省一次 LLM 调用", {
        contentPreview: (assistantMsg1.content ?? "").slice(0, 80),
      });
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
    logger.info("chat.round-2.start", "calling LLM round-2", "Round 2 调模型发起 chat；带 messages + tool_results 让模型用工具结果合成最终答", {
      messagesLen: messages2.length,
      toolResultCount: toolMessages.length,
    });
    const r2 = await callLlmOnce(messages2);
    if (!r2.ok) {
      logger.error("chat.round-2.fail", "round-2 failed → 502", "Round 2 失败；502 返回前端；记 error + upstreamStatus 便于排错", { error: r2.error, upstreamStatus: r2.upstreamStatus });
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
    logger.info("chat.round-2.ok", "round-2 done", "Round 2 成功；拿到 final reply 准备返回前端", {
      finishReason: r2.response.choices[0].finish_reason,
      finalLen: finalReply.length,
      usage: r2.response.usage,
    });

    ctx.body = {
      user_input: input,
      round_1: r1,
      model_tool_calls: toolCallsFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalReply,
    };
    logger.info("chat.reply.sent", "responded to client", "已返回给前端；记 status + finalLen 便于核对", { status: 200, finalLen: finalReply.length });
  });
}
