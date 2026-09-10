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
 * 日志（§5.3.16）：调用函数 五条日志（handlePostChat / handleGetTools 封装层）；
 *   校验挡下单独写 warn；子调用 callProtocolA / executeTool 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, getToolsMeta, type ExecResult } from "../lib/tools/registry.js";
import { callProtocolA, type ProtocolARequest, type ProtocolAResponse, type ChatMsg } from "../lib/llm/protocol-a.js";
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
// parameters 可能是 null（Registry 缺 helper），这里用 as ToolSchema 强转保兼容
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOLS_SCHEMA: any = getToolsForLLM().map((t) => ({
  type: "function" as const,
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
  const tFuncStart = Date.now();
  // ── 取模型 id；缺 Key → 返回错误而不是抛（业务层不要因为没 Key 直接挂） ──
  let modelId = cachedModelA;
  if (modelId === "(未配置)") {
    try {
      modelId = getLlm().modelA;
      cachedModelA = modelId;
    } catch (err: unknown) {
      logger.error(
        "│ chat-callLlmOnce",
        "调用函数结束：callLlmOnce（失败）",
        "为什么写这条日志：apps/.env 没配当前 provider 的 Key；这是阻塞性错误必须立刻告诉用户怎么修。error + （失败）见 spec §5.3.16。",
        {
          返回值: { ok: false, error: "未配置 LLM Key", upstreamStatus: undefined },
          err: err instanceof Error ? err.message : String(err),
          耗时ms: Date.now() - tFuncStart,
        },
      );
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

  logger.info(
    "│ chat-callLlmOnce",
    "调用函数开始：callLlmOnce",
    "为什么写这条日志：route 只认这一层返回的 CallResult；里面那次才是真发网络请求（看「调用函数开始：callProtocolA」）。当前：即将调 callProtocolA，model / messagesCount / toolsCount 都要写。",
    {
      入参: { model: request.model, messagesCount: request.messages.length, toolsCount: request.tools?.length ?? 0, tool_choice: request.tool_choice },
      __code: `await callProtocolA(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const response = await callProtocolA(request);
    logger.info(
      "│ chat-callLlmOnce",
      "调用函数结束：callLlmOnce",
      "为什么写这条日志：route 要把 CallResult 写进 ctx.body 交给页面 stats 区；记 finishReason / toolCallCount 便于核对。",
      {
        返回值: {
          ok: true,
          finishReason: response.choices?.[0]?.finish_reason,
          toolCallCount: response.choices?.[0]?.message?.tool_calls?.length ?? 0,
          usage: response.usage,
        },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { ok: true, request, response };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    const upstreamStatus = e.status;
    const msg = e.error?.message || e.message || String(err);
    logger.error(
      "│ chat-callLlmOnce",
      "调用函数结束：callLlmOnce（失败）",
      "为什么写这条日志：协议 A 抛异常（网络 / 5xx / 4xx）；记 upstreamStatus + 错误信息便于排错。",
      {
        返回值: { ok: false, error: msg, upstreamStatus },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

// ── 路由 ──
export function mountChatRoutes(router: Router): void {
  // Tool Registry 元信息
  router.get("/api/tools", (ctx: Context) => {
    const tHandlerStart = Date.now();
    logger.info(
      "api.tools",
      "调用函数开始：handleGetTools",
      "为什么写这条日志：route 只认这一层返回的 { tools }；里面 getToolsMeta 是真正干活的那一层（debug 等级）。当前：前端 Tool Registry 面板拉一次；记 count 便于核对前后端 tool schema 是否一致。",
      {
        入参: { endpoint: "GET /api/tools" },
        __code: `ctx.body = { tools: TOOLS_META };`,
      },
    );
    ctx.body = { tools: TOOLS_META };
    logger.info(
      "api.tools",
      "调用函数结束：handleGetTools",
      "为什么写这条日志：route 要把 { tools } 写进 ctx.body 交给前端 Registry 面板；记 count 便于核对。",
      {
        返回值: { count: TOOLS_META.length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });

  // 一轮真 LLM 调用（含 tool_calls → tool_result → final_reply）
  router.post("/api/chat", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const body = (ctx.request.body ?? {}) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";

    logger.info(
      "api.chat",
      "调用函数开始：handlePostChat",
      "为什么写这条日志：route 只认这一层返回的响应包；里面两轮 callLlmOnce + executeTool 是真正干活的那一层。当前：前端发来用户输入；记 inputLen 便于复现与防滥用。",
      {
        入参: { inputPreview: input.slice(0, 60), inputLen: input.length, bodyKeys: Object.keys(body) },
        __code: `const r1 = await callLlmOnce([{role:"user", content:input}]);\n// ... executeTool + r2`,
      },
    );

    if (!input) {
      logger.warn(
        "api.chat",
        "调用函数结束：handlePostChat（校验拒绝）",
        "为什么写这条日志：用户输入是空字符串；这是业务失败（不是 LLM 错），走 400 不让 round-1 浪费 token。warn 是「业务失败但能走通」的等级。",
        {
          返回值: { httpStatus: 400, error: "input 不能为空" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    // ── Round 1：user msg → LLM 拿 tool_calls ──
    const messages1: ChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1);
    if (!r1.ok) {
      logger.error(
        "api.chat",
        "调用函数结束：handlePostChat（round-1 失败）",
        "为什么写这条日志：Round 1 调模型失败；502 返回前端；记 error + upstreamStatus 便于排错。",
        {
          返回值: { httpStatus: 502, error: r1.error, upstream_status: r1.upstreamStatus },
          耗时ms: Date.now() - tHandlerStart,
          错误: new Error(r1.error),
        },
      );
      ctx.status = 502; // 上游 LLM 失败
      ctx.body = { error: r1.error, upstream_status: r1.upstreamStatus, round_1: r1 };
      return;
    }
    const assistantMsg1 = r1.response.choices[0].message;
    const toolCallsFromLLM = assistantMsg1.tool_calls ?? [];
    logger.info(
      "api.chat",
      "调用函数进行中：handlePostChat（round-1 OK）",
      "为什么写这条日志：记 finishReason 让排错时知道模型选了哪条路（tool_calls / stop）。",
      {
        中间状态: {
          finishReason: r1.response.choices[0].finish_reason,
          toolCallCount: toolCallsFromLLM.length,
          toolCallNames: toolCallsFromLLM.map((tc) => tc.function.name),
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    // ── Execute：每个 tool_call 过 Registry（gateway + Zod + handler） ──
    const toolResults: ExecResult[] = toolCallsFromLLM.map((tc) => {
      let args: Record<string, unknown> = {};
      // OpenAI 的 tool_calls[].function.arguments 是 JSON 字符串——常见踩坑点
      try {
        args = JSON.parse(tc.function.arguments);
        logger.info(
          "││ chat-handlePostChat",
          `tool_call.arguments JSON 解析成功（${tc.function.name}）`,
          "为什么写这条日志：tool_call.arguments 是合法 JSON；解析成功准备 Zod 校验。",
          {
            第几轮: 1,
            本轮为什么是这些参数: { toolCallId: tc.id, name: tc.function.name, argsKeys: Object.keys(args) },
          },
        );
      } catch {
        logger.warn(
          "││ chat-handlePostChat",
          `tool_call.arguments 不是合法 JSON（${tc.function.name}）`,
          "为什么写这条日志：模型生成了非 JSON 的 arguments（常见踩坑）；记 raw 让 round-2 能纠正。",
          {
            第几轮: 1,
            本轮为什么是这些参数: { toolCallId: tc.id, name: tc.function.name, raw: tc.function.arguments },
          },
        );
        return {
          ok: false,
          tool: tc.function.name,
          tool_call_id: tc.id,
          error: "tool_call.arguments 不是合法 JSON：" + tc.function.arguments,
        };
      }
      const r = executeTool(tc.function.name, args, tc.id);
      logger.info(
        "││ chat-handlePostChat",
        `tool_result（${tc.function.name}）`,
        "为什么写这条日志：工具执行完；result 摘要打，便于核对返回内容（不写全文）。",
        {
          第几轮: 1,
          本轮结果: { toolCallId: tc.id, name: tc.function.name, ok: r.ok, error: r.ok ? undefined : r.error },
        },
      );
      return r;
    });

    // 模型可能直接回自然语言（不调工具）—— 直接返回，跳过 round-2
    if (toolCallsFromLLM.length === 0) {
      logger.info(
        "api.chat",
        "调用函数结束：handlePostChat（no-tool-call）",
        "为什么写这条日志：模型没调工具、直接自然语言答；这种情况跳过 round-2 直接返回 final 节省一次 LLM 调用。",
        {
          返回值: {
            httpStatus: 200,
            contentPreview: (assistantMsg1.content ?? "").slice(0, 80),
            finalReply: assistantMsg1.content ?? "",
          },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
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
    logger.info(
      "││ chat-handlePostChat",
      "调用循环开始：第 2 轮 / 共 2 轮",
      "为什么写这条日志：Round 2 调模型发起 chat；带 messages + tool_results 让模型用工具结果合成最终答。",
      {
        第几轮: 2,
        本轮为什么是这些参数: {
          messagesLen: messages2.length,
          toolResultCount: toolMessages.length,
          reason: "Round-2 必须带 Round-1 的 assistant(tool_calls) + 每个 tool_call_id 对应的 tool result；否则模型拿不到上下文。",
        },
      },
    );
    const r2 = await callLlmOnce(messages2);
    if (!r2.ok) {
      logger.error(
        "││ chat-handlePostChat",
        "调用循环结束：第 2 轮（失败）",
        "为什么写这条日志：Round 2 失败；502 返回前端；记 error + upstreamStatus 便于排错。",
        {
          第几轮: 2,
          本轮结果: { error: r2.error, upstreamStatus: r2.upstreamStatus },
        },
      );
      logger.error(
        "api.chat",
        "调用函数结束：handlePostChat（round-2 失败）",
        "为什么写这条日志：Round 2 失败；502 返回前端；记 error + upstreamStatus 便于排错。",
        {
          返回值: { httpStatus: 502, error: r2.error, upstream_status: r2.upstreamStatus },
          耗时ms: Date.now() - tHandlerStart,
          错误: new Error(r2.error),
        },
      );
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
    logger.info(
      "││ chat-handlePostChat",
      "调用循环结束：第 2 轮",
      "为什么写这条日志：Round 2 成功；拿到 final reply 准备返回前端。",
      {
        第几轮: 2,
        本轮结果: {
          finishReason: r2.response.choices[0].finish_reason,
          finalLen: finalReply.length,
          usage: r2.response.usage,
        },
      },
    );

    ctx.body = {
      user_input: input,
      round_1: r1,
      model_tool_calls: toolCallsFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalReply,
    };
    logger.info(
      "api.chat",
      "调用函数结束：handlePostChat",
      "为什么写这条日志：route 要把响应包写进 ctx.body 交给页面 stats 区；记 finalLen 便于核对。",
      {
        返回值: { httpStatus: 200, finalLen: finalReply.length, toolCallCount: toolCallsFromLLM.length, okCount: toolResults.filter(r => r.ok).length, failCount: toolResults.filter(r => !r.ok).length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });
}