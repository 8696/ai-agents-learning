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
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostChat 封装层）；
 *   闸门挡掉单独打 warn；子调用 callLlmOnce / executeTool 内部已自带五件套。
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
  const tFuncStart = Date.now();
  logger.info(
    "│ 编造检测-detectHallucination",
    "调用函数开始：detectHallucination",
    "为什么打：route 要把 isHallucinated / fakeNumbers 写进 ctx.body 交给页面 stats 区；step-6 核心——让 reply 是否引用 tool_result 在页面上自动可见。",
    {
      入参: { replyPreview: reply.slice(0, 60), replyLen: reply.length, resultsCount: results.length },
      __code: `const sourceNumbers = []; for (const r of results) if (r.ok) extractNumbers(r.result, sourceNumbers);\nconst moneyRe = /¥\\s*(-?\\d+)/g;\nconst tempRe = /(-?\\d+)\\s*(?:°\\s*C|℃)/g;`,
    },
  );

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

  const result = {
    isHallucinated: fakeNumbers.length > 0,
    sourceNumbers,
    replyNumbers,
    fakeNumbers,
  };
  logger.info(
    "│ 编造检测-detectHallucination",
    "调用函数结束：detectHallucination",
    "为什么打：route 要把 isHallucinated + fakeNumbers 写进 ctx.body 交给页面 stats 区；记 sourceCount + replyCount + fakeNumbers 便于核对。",
    {
      返回值: {
        isHallucinated: result.isHallucinated,
        sourceCount: result.sourceNumbers.length,
        replyCount: result.replyNumbers.length,
        fakeNumbers: result.fakeNumbers,
      },
      耗时ms: Date.now() - tFuncStart,
      字段释义: {
        isHallucinated: "true = reply 里出现 tool_result 里没有的数字",
        fakeNumbers: "reply 引用但 tool_result 没有的数字列表（教学核心——可见编造）",
      },
    },
  );
  return result;
}

// ── 一次 LLM 调用 + 兜底 ──
type CallResult =
  | { ok: true; request: ProtocolARequest; response: ProtocolAResponse }
  | { ok: false; request: ProtocolARequest; error: string; upstreamStatus?: number };

async function callLlmOnce(messages: ChatMsg[]): Promise<CallResult> {
  const tFuncStart = Date.now();
  let modelId = cachedModelA;
  if (modelId === "(未配置)") {
    try {
      modelId = getLlm().modelA;
      cachedModelA = modelId;
    } catch (err: unknown) {
      logger.error(
        "│ chat-callLlmOnce",
        "调用函数结束：callLlmOnce（失败）",
        "为什么打：apps/.env 没配当前 provider 的 Key；这是阻塞性错误必须立刻告诉用户怎么修。",
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
    tool_choice: "auto",
  };

  logger.info(
    "│ chat-callLlmOnce",
    "调用函数开始：callLlmOnce",
    "为什么打：route 只认这一层返回的 CallResult；里面那次才是出网（看「调用函数开始：callProtocolA」）。当前：即将调 callProtocolA，model / messagesCount / toolsCount 都要打。",
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
      "为什么打：route 要把 CallResult 写进 ctx.body 交给页面 stats 区；记 finishReason / toolCallCount 便于核对。",
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
      "为什么打：协议 A 抛异常；记 upstreamStatus + 错误信息便于排错。",
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
  router.post("/api/chat", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const body = (ctx.request.body ?? {}) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    logger.info(
      "api.chat",
      "调用函数开始：handlePostChat",
      "为什么打：route 只认这一层返回的响应包；里面两轮 callLlmOnce + executeTool + detectHallucination 是「真活」。当前：step-6 演示协议层数据形态 + 编造检测；记 input + inputLen 便于核对。",
      {
        入参: { inputPreview: input.slice(0, 60), inputLen: input.length, bodyKeys: Object.keys(body) },
        __code: `// 两轮调用 + execute + 回灌 + detectHallucination`,
      },
    );

    if (!input) {
      logger.warn(
        "api.chat",
        "调用函数结束：handlePostChat（闸门拒绝）",
        "为什么打：用户输入是空字符串；走 400 不让 round-1 浪费 token。",
        {
          返回值: { httpStatus: 400, error: "input 不能为空" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    // ── Round 1 ──
    const messages1: ChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1);
    if (!r1.ok) {
      logger.error(
        "api.chat",
        "调用函数结束：handlePostChat（round-1 失败）",
        "为什么打：Round 1 调模型失败；502 返回前端；记 error + upstreamStatus 便于排错。",
        {
          返回值: { httpStatus: 502, error: r1.error, upstream_status: r1.upstreamStatus },
          耗时ms: Date.now() - tHandlerStart,
          错误: new Error(r1.error),
        },
      );
      ctx.status = 502;
      ctx.body = { error: r1.error, upstream_status: r1.upstreamStatus, round_1: r1 };
      return;
    }
    const assistantMsg1 = r1.response.choices[0].message;
    const toolCallsFromLLM = assistantMsg1.tool_calls ?? [];
    logger.info(
      "││ chat-handlePostChat",
      "调用循环进行中：round-1 OK",
      "为什么打：Round 1 模型决定；记 finishReason + toolCallNames 便于核对。",
      {
        中间状态: {
          finishReason: r1.response.choices[0].finish_reason,
          toolCallCount: toolCallsFromLLM.length,
          toolCallNames: toolCallsFromLLM.map((tc) => tc.function.name),
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    // ── Execute：每个 tool_call 过 Registry ──
    const toolResults: ExecResult[] = toolCallsFromLLM.map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        logger.warn(
          "││ chat-handlePostChat",
          `tool_call.arguments 不是合法 JSON（${tc.function.name}）`,
          "为什么打：模型生成了非 JSON 的 arguments（常见踩坑）；记 raw 让 round-2 能纠正。",
          {
            中间状态: { toolCallId: tc.id, name: tc.function.name, raw: tc.function.arguments },
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
        "为什么打：工具执行完；result 摘要打，便于核对返回内容（不打全文）。",
        {
          中间状态: { toolCallId: tc.id, name: tc.function.name, ok: r.ok, error: r.ok ? undefined : r.error },
        },
      );
      return r;
    });

    // 模型可能直接回自然语言（不调工具）
    if (toolCallsFromLLM.length === 0) {
      const directReply = assistantMsg1.content ?? "";
      // 即使没调工具，也跑编造检测（reply 数字 vs 空源集）
      const hallucination = detectHallucination(directReply, []);
      logger.info(
        "api.chat",
        "调用函数结束：handlePostChat（no-tool-call）",
        "为什么打：模型没调工具、直接自然语言答；跑编造检测（源集为空 → 任何 reply 数字都是 fake）；打 hallucinated 状态便于核对。",
        {
          返回值: { httpStatus: 200, finalLen: directReply.length, hallucinated: hallucination.isHallucinated, fakeNumbers: hallucination.fakeNumbers },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
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
      logger.error(
        "api.chat",
        "调用函数结束：handlePostChat（round-2 失败）",
        "为什么打：Round 2 失败；502 返回前端；记 error + upstreamStatus 便于排错。",
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
      "调用循环进行中：round-2 OK",
      "为什么打：Round 2 成功；拿到 final reply 准备 detectHallucination。",
      {
        中间状态: { finishReason: r2.response.choices[0].finish_reason, finalLen: finalReply.length },
      },
    );

    // ── 编造检测（核心新增）：扫 reply 数字 vs tool_result 数字 ──
    const hallucination = detectHallucination(finalReply, toolResults);
    logger.info(
      "api.chat",
      "调用函数结束：handlePostChat",
      "为什么打：route 要把响应包（4 张数据卡 + 编造检测）写进 ctx.body 交给页面 stats 区；记 isHallucinated + fakeNumbers 便于核对。",
      {
        返回值: { status: 200, finalLen: finalReply.length, hallucinated: hallucination.isHallucinated, fakeNumbers: hallucination.fakeNumbers },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    ctx.body = {
      user_input: input,
      round_1: r1,
      model_tool_calls: toolCallsFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalReply,
      hallucination,
    };
  });
}