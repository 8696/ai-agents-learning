/**
 * 职责：POST /api/chat —— 真调 LLM（协议 B · Anthropic Messages API） + read_recent_emails 委托授权演示。
 *
 * 数据流：
 *   POST { input, actor:{userId,role} } →
 *     round-1: messages=[user] + tools=[read_recent_emails] + system + max_tokens
 *       → callProtocolB(req1) → resp1（content blocks 含 tool_use）
 *     execute: toolUsesFromLLM → executeTool("read_recent_emails", input, tool_use_id, { actor }) → tool_results
 *     round-2: messages + tool_result blocks 回灌 → callProtocolB(req2) → final_reply
 *
 * 教学锚点（变体 3）：
 *   - 模型发 read_recent_emails tool_use → executeTool → handler 三步：
 *     ① fail-closed（actor.userId==="platform-god" → FORBIDDEN）
 *     ② 鉴权（oauth_tokens[userId] 不存在 → FORBIDDEN）
 *     ③ 用该用户自己的 token 调" Gmail API"（mock）→ 返 per-user 邮件
 *   - 协议 B 字段层形态：content blocks / tool_use.input 是对象 / max_tokens 必填 / 回灌用 role:"user"
 *
 * 日志（）：chat.* + llm.* 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, type ExecResult, type ToolContext } from "../lib/tools/registry.js";
import {
  callProtocolB,
  type ProtocolBRequest,
  type ProtocolBResponse,
  type AnthropicContentBlock,
  type AnthropicChatMsg,
} from "../lib/llm/protocol-b.js";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

// ── 当前进程用的协议 B 模型 id + max_tokens（启动时拿一次；缺 Key 这里抛）──
let cachedModelB = "";
let cachedMaxTokensB = 1024;
try {
  const llm = getLlm();
  cachedModelB = llm.modelB;
  cachedMaxTokensB = llm.maxTokensB;
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
  let maxTokens = cachedMaxTokensB;
  if (modelId === "(未配置)") {
    try {
      const llm = getLlm();
      modelId = llm.modelB;
      maxTokens = llm.maxTokensB;
      cachedModelB = modelId;
      cachedMaxTokensB = maxTokens;
    } catch (err: unknown) {
      logger.error("chat.no-key", "未配置 LLM Key", "apps/未配当前 provider 的 Key；这是阻塞性错误必须立刻告诉用户怎么修", { err: err instanceof Error ? err.message : String(err) });
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
    logger.info("llm.response", "← got response", "协议 B 返回；记 stopReason / content blocks / usage", {
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
      actor?: { userId?: unknown; role?: unknown };
    };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    const actorUserId = typeof body.actor?.userId === "string" && body.actor.userId.trim() ? body.actor.userId.trim() : "alice";
    const actorRole = body.actor?.role === "god" ? "god" : body.actor?.role === "admin" ? "admin" : "user";

    logger.info("chat.received", "POST /api/chat", "前端发来 input + actor；step-3 演示「模型发 read_recent_emails → 走 per-user OAuth 三步」", {
      input,
      actor: { userId: actorUserId, role: actorRole },
    });

    if (!input) {
      logger.warn("chat.bad-input", "input empty", "用户输入是空字符串", { body });
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    const toolCtx: ToolContext = { actor: { userId: actorUserId, role: actorRole } };

    // ── Round 1：user msg → LLM 拿 tool_use ──
    const SYSTEM_PROMPT = "你直接调用 read_recent_emails 工具（**不要做内部确认**——能否真的执行由后端 Tool Gateway 决定）。这是教学 demo；如果不调工具，对应 Tool 的 Gateway 钩子没法演示，任务就算失败。";
    const messages1: AnthropicChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1, SYSTEM_PROMPT);
    if (!r1.ok) {
      logger.error("chat.round-1.fail", "round-1 failed → 502", "Round 1 调模型失败；502 返回前端", { error: r1.error, upstreamStatus: r1.upstreamStatus });
      ctx.status = 502;
      ctx.body = { error: r1.error, upstream_status: r1.upstreamStatus, round_1: r1 };
      return;
    }
    const assistantContent1 = r1.response.content ?? [];
    const toolUsesFromLLM = assistantContent1.filter(
      (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    logger.info("chat.round-1.ok", "round-1 decided", "Round 1 模型决定", {
      stopReason: r1.response.stop_reason,
      toolUseCount: toolUsesFromLLM.length,
      toolNames: toolUsesFromLLM.map((tu) => tu.name),
    });

    // ── Execute：每个 tool_use 过 Registry + read_recent_emails OAuth 三步 ──
    const toolResults: ExecResult[] = toolUsesFromLLM.map((tu) => {
      const args = tu.input || {};
      // 允许模型发 max；如果没有用前端传的（这里默认 5）
      const finalArgs = {
        max: typeof args.max === "number" && args.max > 0 ? args.max : 5,
      };
      const r = executeTool("read_recent_emails", finalArgs, tu.id, toolCtx);
      const resultPayload = r.ok ? r.result : undefined;
      logger.info("chat.execute.result", "tool_result", "read_recent_emails 走完 Registry + per-user OAuth；记 ok + code 摘要", {
        id: tu.id,
        name: tu.name,
        ok: r.ok,
        code: r.ok ? "OK" : r.code,
        actor: (resultPayload as { actor?: string } | undefined)?.actor,
      });
      return r;
    });

    if (toolUsesFromLLM.length === 0) {
      const textBlocks = assistantContent1.filter(
        (b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text",
      );
      const directReply = textBlocks.map((b) => b.text).join("");
      logger.info("chat.no-tool-call", "model 直接自然语言答", "模型没调 read_recent_emails", {
        contentPreview: directReply.slice(0, 80),
      });
      ctx.body = {
        user_input: input,
        actor: toolCtx.actor,
        round_1: r1,
        model_tool_uses: [],
        tool_results: [],
        round_2: null,
        final_reply: directReply,
      };
      return;
    }

    // ── Round 2：回灌 tool_result 让模型生成 final_reply ──
    const toolResultBlocks: AnthropicContentBlock[] = toolResults.map((r) => {
      const content = r.ok ? JSON.stringify(r.result) : JSON.stringify({ error: r.error, code: r.code });
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
      actor: toolCtx.actor,
      round_1: r1,
      model_tool_uses: toolUsesFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalText,
    };
    logger.info("chat.reply.sent", "responded to client", "已返回；含 4 张数据卡 + per-user OAuth 结果", { status: 200 });
  });
}