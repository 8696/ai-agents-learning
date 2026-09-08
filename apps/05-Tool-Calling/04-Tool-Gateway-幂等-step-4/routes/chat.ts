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
 * 日志（）：chat.* + llm.* 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, type ExecResult } from "../lib/tools/registry.js";
import {
  callProtocolB,
  type ProtocolBRequest,
  type ProtocolBResponse,
  type AnthropicContentBlock,
  type AnthropicChatMsg,
} from "../lib/llm/protocol-b.js";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

// ── 当前进程用的协议 B 模型 id + max_tokens ──
let cachedModelB = "";
let cachedMaxTokens = 102;
try {
 const llm = getLlm();
 cachedModelB = llm.modelB;
 cachedMaxTokens = llm.maxTokensB;
} catch {
 cachedModelB = "(未配置)";
}

// ── 派生当前 Registry 的 tools schema（协议 B 格式）──
const TOOLS_SCHEMA = getToolsForLLM().map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

// ── 一次 LLM 调用 + 兜底 ──
type CallResult =
  | { ok: true; request: ProtocolBRequest; response: ProtocolBResponse }
  | { ok: false; request: ProtocolBRequest; error: string; upstreamStatus?: number };

async function callLlmOnce(messages: AnthropicChatMsg[], system?: string): Promise<CallResult> {
  let modelId = cachedModelB;
  let maxTokens = cachedMaxTokens;
  if (modelId === "(未配置)") {
    try {
      const llm = getLlm();
      modelId = llm.modelB;
      maxTokens = llm.maxTokensB;
      cachedModelB = modelId;
      cachedMaxTokens = maxTokens;
    } catch (err: unknown) {
      logger.error("chat.no-key", "未配置 LLM Key", "apps/未配当前 provider 的 Key；这是阻塞性错误", { err: err instanceof Error ? err.message : String(err) });
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

  try {
    const response = await callProtocolB(request);
    logger.info("llm.response", "← got response", "协议 B 返回", {
      stopReason: response.stop_reason,
      contentBlockCount: response.content?.length ?? 0,
      toolUseCount: (response.content ?? []).filter((b) => b.type === "tool_use").length,
      usage: response.usage,
    });
    return { ok: true, request, response };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    const upstreamStatus = e.status;
    const msg = e.error?.message || e.message || String(err);
    logger.error("llm.error", "callProtocolB threw", "协议 B 抛异常", { upstreamStatus, err: msg });
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

// ── 路由 ──
export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as {
      input?: unknown;
    };
    const input = typeof body.input === "string" ? body.input.trim() : "";

    logger.info("chat.received", "POST /api/chat", "前端发来 input；step-4 演示「模型发 divide → handler throw → 中间件捕获 → 结构化错误 → Round 2 模型改输入」", {
      input,
    });

    if (!input) {
      logger.warn("chat.bad-input", "input empty", "用户输入是空字符串", { body });
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    // ── Round 1 ──
    const SYSTEM_PROMPT = "你直接调用 divide 工具（**不要做内部确认**——能否真的执行由后端 Tool Gateway 决定）。handler throw（如 b=0）→ 中间件捕获 → 返结构化 tool_result `{status:\"error\",code,message,retryable}` → 模型下轮可改输入。这是教学 demo；如果不调工具，对应 Tool 的 Gateway 钩子没法演示，任务就算失败。";
    const messages1: AnthropicChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1, SYSTEM_PROMPT);
    if (!r1.ok) {
      logger.error("chat.round-1.fail", "round-1 failed → 502", "Round1 调模型失败", { error: r1.error, upstreamStatus: r1.upstreamStatus });
      ctx.status = 502;
      ctx.body = { error: r1.error, upstream_status: r1.upstreamStatus, round_1: r1 };
      return;
    }
    const assistantContent1 = r1.response.content ?? [];
    const toolUsesFromLLM = assistantContent1.filter(
      (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    logger.info("chat.round-1.ok", "round-1 decided", "Round1 模型决定", {
      stopReason: r1.response.stop_reason,
      toolUseCount: toolUsesFromLLM.length,
      toolNames: toolUsesFromLLM.map((tu) => tu.name),
    });

    // ── Execute：每个 tool_use 过 Registry + Tool 内部 throw → 中间件捕获 ──
    const toolResults: ExecResult[] = toolUsesFromLLM.map((tu) => {
      const args = tu.input || {};
      const r = executeTool(tu.name, args, tu.id, {});
      logger.info("chat.execute.result", "tool_result", "Tool 走完；记 ok + code 摘要（throw 走 fail 路径也返结构化）", {
        id: tu.id,
        name: tu.name,
        ok: r.ok,
        code: r.ok ? "OK" : r.code,
        status: r.ok ? "ok" : r.status,
        retryable: r.ok ? undefined : r.retryable,
      });
      return r;
    });

    if (toolUsesFromLLM.length === 0) {
      const textBlocks = assistantContent1.filter(
        (b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text",
      );
      const directReply = textBlocks.map((b) => b.text).join("");
      logger.info("chat.no-tool-call", "model 直接自然语言答", "模型没调 divide", {
        contentPreview: directReply.slice(0, 80),
      });
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

    // ── Round 2：回灌 tool_result（is_error:true + code + retryable）让模型看到错误 → 改输入重试 ──
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
      logger.error("chat.round-2.fail", "round-2 failed → 502", "Round 2 失败", { error: r2.error, upstreamStatus: r2.upstreamStatus });
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
    logger.info("chat.round-2.ok", "round-2 done", "Round 2 成功", {
      stopReason: r2.response.stop_reason,
      finalLen: finalText.length,
    });

    ctx.body = {
      user_input: input,
      round_1: r1,
      model_tool_uses: toolUsesFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalText,
    };
    logger.info("chat.reply.sent", "responded to client", "已返回；含 4 张数据卡 + final_reply", { status: 200 });
  });
}