/**
 * 职责：POST /api/chat —— 真调 LLM（协议 B · Anthropic Messages API） + divide 抛错结构化演示。
 *
 * 数据流：
 *   POST { input } →
 *     round-1: messages=[user] + tools=[divide] + system + max_tokens
 *       → callProtocolB(req1) → resp1（content blocks）
 *     execute: toolUsesFromLLM → executeTool("divide", { a, b }, tool_use_id, {})
 *       ├ b=0 → handler throw → registry catch → 返 code=DIVIDE_BY_ZERO · retryable=true
 *       └ a/b Zod 失败 → 返 code=INVALID_PARAM · retryable=true
 *     round-2: messages + tool_result blocks（is_error:true + code + retryable）回灌
 *       → callProtocolB(req2) → resp2（模型看到错误 → 改 b 重试 → final_reply）
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 4）：
 *   - handler throw → registry try/catch 捕获 → 包成结构化 {status:"error",code,retryable} → Round 2 模型改输入
 *   - 业务错误 ≠ HTTP 500；整轮 agent 不挂
 *   - Zod 参数错走同一条结构化路径
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostChat 封装层）；
 *   闸门挡掉（400）单独打 warn；子调用 callLlmOnce / executeTool 内部已自带五件套。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, type ExecResult } from "../lib/tools/registry.js";
import { callProtocolB, type ProtocolBRequest, type ProtocolBResponse, type AnthropicContentBlock, type AnthropicChatMsg } from "../lib/llm/protocol-b.js";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

let cachedModelB = "";
let cachedMaxTokensB = 1024;
try {
  const llm = getLlm();
  cachedModelB = llm.modelB;
  cachedMaxTokensB = llm.maxTokensB;
} catch {
  cachedModelB = "(未配置)";
}

const TOOLS_SCHEMA = getToolsForLLM().map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

type CallResult =
  | { ok: true; request: ProtocolBRequest; response: ProtocolBResponse }
  | { ok: false; request: ProtocolBRequest; error: string; upstreamStatus?: number };

async function callLlmOnce(messages: AnthropicChatMsg[], system?: string): Promise<CallResult> {
  const tFuncStart = Date.now();
  let modelId = cachedModelB;
  let maxTokens = cachedMaxTokensB;
  if (modelId === "(未配置)") {
    try {
      const llm = getLlm();
      modelId = llm.modelB;
      maxTokens = llm.maxTokensB;
      cachedModelB = modelId;
      cachedMaxTokensB = maxTokens;
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
        request: { model: "?", messages, tools: TOOLS_SCHEMA, max_tokens: maxTokens },
        error: "未配置 LLM Key：" + (err instanceof Error ? err.message : String(err)),
      };
    }
  }

  const request: ProtocolBRequest = {
    model: modelId,
    messages,
    tools: TOOLS_SCHEMA,
    max_tokens: maxTokens,
  };
  if (system) request.system = system;

  logger.info(
    "│ chat-callLlmOnce",
    "调用函数开始：callLlmOnce",
    "为什么打：route 只认这一层返回的 CallResult；里面那次才是出网（看「调用函数开始：callProtocolB」）。当前：即将调 callProtocolB。",
    {
      入参: { model: request.model, max_tokens: request.max_tokens, messagesCount: request.messages.length, toolsCount: request.tools?.length ?? 0, hasSystem: Boolean(system) },
      __code: `await callProtocolB(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const response = await callProtocolB(request);
    logger.info(
      "│ chat-callLlmOnce",
      "调用函数结束：callLlmOnce",
      "为什么打：route 要把 CallResult 写进 ctx.body 交给页面 stats 区；记 stopReason / toolUseCount 便于核对。",
      {
        返回值: {
          ok: true,
          stopReason: response.stop_reason,
          contentBlockCount: response.content?.length ?? 0,
          toolUseCount: (response.content ?? []).filter((b) => b.type === "tool_use").length,
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
      "为什么打：协议 B 抛异常；记 upstreamStatus + 错误信息便于排错。",
      {
        返回值: { ok: false, error: msg, upstreamStatus },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const body = (ctx.request.body ?? {}) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";

    logger.info(
      "api.chat",
      "调用函数开始：handlePostChat",
      "为什么打：route 只认这一层返回的响应包；里面两轮 callLlmOnce + executeTool 是「真活」。当前：step-4 演示「handler throw → 结构化错误 → Round-2 模型改输入重试」。",
      {
        入参: { inputPreview: input.slice(0, 60), inputLen: input.length },
        __code: `// 强提示 → callLlmOnce → executeTool(divide) → callLlmOnce(回灌 tool_result is_error:true) → final_reply`,
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

    const SYSTEM_PROMPT = "你直接调用 divide 工具（**不要做内部确认**——是否真的执行由后端 Tool Gateway 决定；失败会返结构化错误 code + retryable）。如果第一次失败，**改输入**（如把 b 从 0 改 1）再调一次，直到成功。这是教学 demo；如果不调工具，对应 Tool 的 Gateway 钩子没法演示，任务就算失败。";
    const messages1: AnthropicChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1, SYSTEM_PROMPT);
    if (!r1.ok) {
      logger.error(
        "api.chat",
        "调用函数结束：handlePostChat（round-1 失败）",
        "为什么打：Round1 调模型失败；502 返回前端。",
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
    const assistantContent1 = r1.response.content ?? [];
    const toolUsesFromLLM = assistantContent1.filter(
      (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    logger.info(
      "││ chat-handlePostChat",
      "调用循环进行中：round-1 OK",
      "为什么打：Round 1 模型决定；记 stopReason + toolNames 便于核对协议 B 物理形态。",
      {
        中间状态: { stopReason: r1.response.stop_reason, toolUseCount: toolUsesFromLLM.length, toolNames: toolUsesFromLLM.map((tu) => tu.name) },
      },
    );

    const toolResults: ExecResult[] = toolUsesFromLLM.map((tu) => {
      const args = tu.input || {};
      const r = executeTool(tu.name, args, tu.id, {});
      logger.info(
        "││ chat-handlePostChat",
        `tool_result（${tu.name}）`,
        "为什么打：Tool 走完；记 ok + code 摘要（throw 走 fail 路径也返结构化）。",
        {
          中间状态: { toolUseId: tu.id, name: tu.name, ok: r.ok, code: r.ok ? "OK" : r.code, status: r.ok ? "ok" : r.status, retryable: r.ok ? undefined : r.retryable },
        },
      );
      return r;
    });

    if (toolUsesFromLLM.length === 0) {
      const textBlocks = assistantContent1.filter(
        (b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text",
      );
      const directReply = textBlocks.map((b) => b.text).join("");
      logger.info(
        "api.chat",
        "调用函数结束：handlePostChat（no-tool-call）",
        "为什么打：模型没调 divide；可能是 query 不够触发。",
        {
          返回值: { httpStatus: 200, finalLen: directReply.length, contentPreview: directReply.slice(0, 80) },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.body = {
        user_input: input,
        round_1: r1,
        model_tool_uses: [],
        tool_results: [],
        round_2: null,
        final_reply: directReply,
      };
      return;
    }

    const toolResultBlocks: AnthropicContentBlock[] = toolResults.map((r) => {
      const content = r.ok ? JSON.stringify(r.result) : JSON.stringify({ error: r.error, code: r.code, retryable: r.retryable });
      return {
        type: "tool_result",
        tool_use_id: r.tool_call_id,
        content,
        is_error: !r.ok,
      };
    });

    const messages2: AnthropicChatMsg[] = [
      ...messages1,
      { role: "assistant", content: assistantContent1 },
      { role: "user", content: toolResultBlocks },
    ];
    const r2 = await callLlmOnce(messages2, SYSTEM_PROMPT);
    if (!r2.ok) {
      logger.error(
        "api.chat",
        "调用函数结束：handlePostChat（round-2 失败）",
        "为什么打：Round 2 失败；502 返回前端。",
        {
          返回值: { httpStatus: 502, error: r2.error, upstream_status: r2.upstreamStatus },
          耗时ms: Date.now() - tHandlerStart,
          错误: new Error(r2.error),
        },
      );
      ctx.body = {
        error: r2.error,
        upstream_status: r2.upstreamStatus,
        round_1: r1,
        model_tool_uses: toolUsesFromLLM,
        tool_results: toolResults,
        round_2: r2,
      };
      return;
    }
    const finalContent2 = r2.response.content ?? [];
    const finalText = finalContent2
      .filter((b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("");
    logger.info(
      "││ chat-handlePostChat",
      "调用循环进行中：round-2 OK",
      "为什么打：Round 2 成功；拿到 final reply 准备返回。",
      {
        中间状态: { stopReason: r2.response.stop_reason, finalLen: finalText.length },
      },
    );

    logger.info(
      "api.chat",
      "调用函数结束：handlePostChat",
      "为什么打：route 要把响应包写进 ctx.body 交给页面 stats 区；含 4 张数据卡 + final_reply。",
      {
        返回值: { status: 200, finalLen: finalText.length, toolResultCount: toolResults.length, okCount: toolResults.filter(r => r.ok).length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    ctx.body = {
      user_input: input,
      round_1: r1,
      model_tool_uses: toolUsesFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalText,
    };
  });
}