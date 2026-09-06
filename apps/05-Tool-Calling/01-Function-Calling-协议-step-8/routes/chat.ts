/**
 * 职责：POST /api/chat —— 真调 LLM（协议 B · Anthropic Messages API），完整两轮 + 4 张数据卡。
 *
 * 数据流：
 *   POST { input } →
 *     round-1: messages=[user] + tools=[3 项 Registry 派生] + max_tokens=1024
 *       → callProtocolB(req1) → resp1
 *     execute: toolUsesFromLLM → executeTool() → tool_results
 *     round-2: messages=[user, assistant(content blocks), user(content: tool_result blocks)]
 *       → callProtocolB(req2) → resp2 (final_reply)
 *     ctx.body = { user_input, round_1, tool_results, round_2, final_reply }
 *
 * step-8 vs step-6（协议 B vs 协议 A · 同骨架 · 不同字段）：
 *   - 决定调：resp1.content[i].type === "tool_use" · id + name + **input**（对象）
 *   - 回灌：messages 含 assistant(content blocks) + user(content: [{ type: "tool_result", tool_use_id, content }])
 *   - 必填：max_tokens = llm.maxTokensB（不填 → 400）
 *
 * 不含编造检测：step-8 教学点是"协议 B 字段层物理形态"，编造检测是 step-6 教学点。
 * 学习者可对照 step-6 协议 A 4 张卡 + step-8 协议 B 4 张卡自行看差异。
 *
 * 日志（§5.3.16）：chat.* + llm.* 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, type ExecResult } from "../lib/tools/registry.js";
import { callProtocolB, type ProtocolBRequest, type ProtocolBResponse, type AnthropicContentBlock, type AnthropicChatMsg } from "../lib/llm/protocol-b.js";
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

// ── 派生当前 Registry 的 tools schema（Anthropic 格式：name/description/input_schema）──
const TOOLS_SCHEMA = getToolsForLLM().map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

// ── 一次 LLM 调用 + 兜底 ──
type CallResult =
  | { ok: true; request: ProtocolBRequest; response: ProtocolBResponse }
  | { ok: false; request: ProtocolBRequest; error: string; upstreamStatus?: number };

async function callLlmOnce(messages: AnthropicChatMsg[]): Promise<CallResult> {
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
      logger.error("chat.no-key", "未配置 LLM Key", "apps/.env 没配当前 provider 的 Key；这是阻塞性错误必须立刻告诉用户怎么修", { err: err instanceof Error ? err.message : String(err) });
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

  try {
    const response = await callProtocolB(request);
    logger.info("llm.response", "← got response", "调模型返；记 stopReason / content blocks / usage", {
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
    const body = (ctx.request.body ?? {}) as { input?: unknown };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    logger.info("chat.received", "POST /api/chat", "前端发来用户输入；step-8 演示协议 B 物理形态（Anthropic Messages API）", { input, inputLen: input.length });

    if (!input) {
      logger.warn("chat.bad-input", "input empty", "用户输入是空字符串", { body });
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    // ── Round 1 ──
    const messages1: AnthropicChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1);
    if (!r1.ok) {
      logger.error("chat.round-1.fail", "round-1 failed → 502", "Round 1 调模型失败", { error: r1.error, upstreamStatus: r1.upstreamStatus });
      ctx.status = 502;
      ctx.body = { error: r1.error, upstream_status: r1.upstreamStatus, round_1: r1 };
      return;
    }
    const assistantContent1 = r1.response.content ?? [];
    const toolUsesFromLLM = assistantContent1.filter((b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> => b.type === "tool_use");
    logger.info("chat.round-1.ok", "round-1 decided", "Round 1 模型决定", {
      stopReason: r1.response.stop_reason,
      toolUseCount: toolUsesFromLLM.length,
      toolNames: toolUsesFromLLM.map((tu) => tu.name),
    });

    // ── Execute：每个 tool_use 过 Registry ──
    const toolResults: ExecResult[] = toolUsesFromLLM.map((tu) => {
      const args = tu.input;  // **是对象，不是 JSON 字符串**（vs 协议 A）
      const r = executeTool(tu.name, args, tu.id);
      logger.info("chat.execute.result", "tool_result", "工具执行完", {
        id: tu.id, name: tu.name, ok: r.ok,
      });
      return r;
    });

    // 模型可能直接回自然语言（不调工具）
    if (toolUsesFromLLM.length === 0) {
      const textBlocks = assistantContent1.filter((b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text");
      const directReply = textBlocks.map((b) => b.text).join("");
      logger.info("chat.no-tool-call", "model 直接自然语言答", "模型没调工具；content blocks 全是 text", {
        contentPreview: directReply.slice(0, 80),
      });
      ctx.body = {
        user_input: input,
        round_1: r1,
        model_tool_uses: [],
        tool_results: [],
        final_reply: directReply,
      };
      return;
    }

    // ── Round 2：回灌 tool_result 让模型生成 final_reply ──
    // 协议 B 关键：回灌用 role: "user" + content: [{ type: "tool_result", tool_use_id, content }] blocks
    const toolResultBlocks: AnthropicContentBlock[] = toolResults.map((r) => ({
      type: "tool_result",
      tool_use_id: r.tool_call_id,
      content: r.ok ? JSON.stringify(r.result) : JSON.stringify({ error: r.error }),
      is_error: !r.ok,
    }));

    const messages2: AnthropicChatMsg[] = [
      ...messages1,
      { role: "assistant", content: assistantContent1 },
      { role: "user", content: toolResultBlocks },
    ];
    const r2 = await callLlmOnce(messages2);
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
    logger.info("chat.reply.sent", "responded to client", "已返回；含 4 张数据卡（协议 B 形态）", { status: 200 });
  });
}