/**
 * 职责：POST /api/chat —— 真调 LLM（协议 B · Anthropic Messages API）+ Tool Gateway（delete_user）。
 *
 * 数据流：
 *   POST { input, actor:{userId,role}, confirmToken? } →
 *     round-1: messages=[user] + tools=[delete_user · 协议 B input_schema] + max_tokens
 *       → callProtocolB(req1) → resp1
 *     execute: toolUsesFromLLM → executeTool(name, input, tool_use_id, {actor, confirmToken}) → tool_results
 *     round-2: messages=[user, assistant(content blocks), user(content: tool_result blocks)]
 *       → callProtocolB(req2) → resp2 (final_reply)
 *     ctx.body = { user_input, actor, confirm_token, round_1, model_tool_uses, tool_results, round_2, final_reply }
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 1）：
 *   - **不是**"模型发出 tool_call 就执行"——executeTool 内部走 Gateway 三钩子
 *   - 前端能看到：协议 B 4 张数据卡（Round 1/2 Request/Response）+ 钩子判定链 + audit 元信息
 *   - 通过 / 拒绝（FORBIDDEN / RATE_LIMITED / NEEDS_CONFIRM）/ 二次确认 三态教学
 *
 * 日志（§5.3.16）：chat.* + llm.* 都打；executeTool 内部 + audit 都会写文件。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  executeTool,
  getToolsForLLM,
  type ToolContext,
  type ExecResult,
  type HookTraceRow,
} from "../lib/tools/registry.js";
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

// ── 派生当前 Registry 的 tools schema（协议 B 格式：name/description/input_schema）──
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
    logger.error("llm.error", "callProtocolB threw", "协议 B 抛异常（网络 / 5xx / 4xx）", { upstreamStatus, err: msg });
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

// ── 路由 ──
export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as {
      input?: unknown;
      actor?: { userId?: unknown; role?: unknown };
      confirmToken?: unknown;
    };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    const actorUserId = typeof body.actor?.userId === "string" && body.actor.userId.trim() ? body.actor.userId.trim() : "alice";
    const actorRole = body.actor?.role === "user" ? "user" : "admin";
    const confirmToken = typeof body.confirmToken === "string" && body.confirmToken.trim() ? body.confirmToken.trim() : undefined;

    logger.info("chat.received", "POST /api/chat", "前端发来用户输入 + actor + confirmToken；step-1 演示「模型发 tool_use → Gateway 三钩子 → 拒绝/通过/二次确认」", {
      input,
      inputLen: input.length,
      actor: { userId: actorUserId, role: actorRole },
      confirmToken: confirmToken ?? "(未带)",
    });

    if (!input) {
      logger.warn("chat.bad-input", "input empty", "用户输入是空字符串；这是业务失败（不是 LLM 错），走 400", { body });
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    const ctxStore: ToolContext = {
      actor: { userId: actorUserId, role: actorRole },
      confirmToken,
    };

    // ── Round 1：user msg → LLM 拿 tool_use ──
    // 协议 B 支持 system 字段；这里用一句强提示让模型倾向先发 tool_use（由后端 Gateway 决定能不能执行）
    // 理由：MiniMax-M3 等模型读 Tool description 时会自检"是不是危险"然后拒调；要明确告诉它「这是教学 demo，必须先发，后端才有机会演示 Gateway 钩子」
    const SYSTEM_PROMPT = "你必须直接调用 delete_user 工具（输入 user_id 与 reason）。**不要做内部确认**——是否真的删除由后端 Tool Gateway 决定（鉴权/配额/二次确认）；后端会返结构化错误（NEEDS_CONFIRM/FORBIDDEN/RATE_LIMITED）时，你把错误翻译给用户即可。这是教学 demo；如果不调用工具，后端 Gateway 三钩子没法演示，任务就算失败。";
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

    // ── Execute：每个 tool_use 过 Registry + Gateway 三钩子 ──
    const toolResults: ExecResult[] = toolUsesFromLLM.map((tu) => {
      const args = tu.input; // **是对象**，不是 JSON 字符串（协议 B vs A）
      const r = executeTool(tu.name, args, tu.id, ctxStore);
      logger.info("chat.execute.result", "tool_result", "Tool 走完 Registry + Gateway；打 ok + code + retryAfterMs 摘要（#14 端到端透传）", {
        id: tu.id,
        name: tu.name,
        ok: r.ok,
        code: r.ok ? "OK" : r.code,
        retryAfterMs: r.ok ? undefined : r.retryAfterMs,
      });
      return r;
    });

    // 模型可能直接回自然语言（不调工具）—— 跳 round-2
    if (toolUsesFromLLM.length === 0) {
      const textBlocks = assistantContent1.filter(
        (b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text",
      );
      const directReply = textBlocks.map((b) => b.text).join("");
      logger.info("chat.no-tool-call", "model 直接自然语言答", "模型没调 delete_user；可能是 query 不够触发", {
        contentPreview: directReply.slice(0, 80),
      });
      ctx.body = {
        user_input: input,
        actor: ctxStore.actor,
        confirm_token: ctxStore.confirmToken ?? null,
        round_1: r1,
        model_tool_uses: [],
        tool_results: [],
        round_2: null,
        final_reply: directReply,
      };
      return;
    }

    // ── Round 2：回灌 tool_result 让模型生成 final_reply ──
    // 协议 B 关键：role:"user" + content:`[{type:"tool_result", tool_use_id, content, is_error}]`
    const toolResultBlocks: AnthropicContentBlock[] = toolResults.map((r) => {
      // 序列化：ok → payload 序列化；error → error + code + retryAfterMs 序列化（#14：限流撞线时透传等多久）
      const content = r.ok
        ? JSON.stringify(r.result)
        : JSON.stringify({ error: r.error, code: r.code, retryAfterMs: r.retryAfterMs });
      const traceRow: HookTraceRow | undefined = (r.hookTrace ?? [])[0];
      const block: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: r.tool_call_id,
        content,
        is_error: !r.ok,
      };
      void traceRow;
      return block;
    });

    const messages2: AnthropicChatMsg[] = [
      ...messages1,
      { role: "assistant", content: assistantContent1 },
      { role: "user", content: toolResultBlocks },
    ];
    const r2 = await callLlmOnce(messages2, SYSTEM_PROMPT);
    if (!r2.ok) {
      logger.error("chat.round-2.fail", "round-2 failed → 502", "Round 2 失败；502 返回前端", { error: r2.error, upstreamStatus: r2.upstreamStatus });
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
      actor: ctxStore.actor,
      confirm_token: ctxStore.confirmToken ?? null,
      round_1: r1,
      model_tool_uses: toolUsesFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalText,
    };
    logger.info("chat.reply.sent", "responded to client", "已返回；含 4 张数据卡 + 钩子判定链", { status: 200 });
  });
}