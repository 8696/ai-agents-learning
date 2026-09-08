/**
 * 职责：POST /api/chat —— 真调 LLM（协议 B · Anthropic Messages API） + create_order 幂等演示。
 *
 * 数据流：
 *   POST { input, items, idempotency_key } →
 *     round-1: messages=[user] + tools=[create_order] + system + max_tokens
 *       → callProtocolB(req1) → resp1
 *     execute: toolUsesFromLLM → executeTool("create_order", { items, idempotency_key }, ...) → tool_results
 *     round-2: messages + tool_result blocks 回灌 → callProtocolB(req2) → final_reply
 *
 * 教学锚点（变体 2）：
 *   - 模型发 create_order tool_use → executeTool → 走幂等 cache + 内存 DB
 *   - 协议 B 字段层形态：content blocks、tool_use.input 是 对象、必填 max_tokens、回灌用 role:"user"
 *   - 「同 key 调 3 次 → DB 只插 1 行」通过前端「同 key 调 3 次」按钮触发 3 次 /api/chat 实现
 *
 * 日志（：chat.* + llm.* 都打；executeTool 内部 + audit 都会写文件。
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
    logger.error("llm.error", "callProtocolB threw", "协议 B 抛异常（网络 / 5xx / 4xx）", { upstreamStatus, err: msg });
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

// ── #24：频率限流（每 actor 每分钟 ≤ 60 次 → FREQ_LIMITED）──
// 进程内滑动窗口 Map<actorUserId, timestamps[]>；演示用，生产用 Redis INCR
const freqWindowMs = 60_000;
const freqMax = 60;
const freqBuckets = new Map<string, number[]>();

function checkFreqLimit(actorUserId: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const arr = (freqBuckets.get(actorUserId) ?? []).filter((t) => now - t < freqWindowMs);
  if (arr.length >= freqMax) {
    const oldest = arr[0];
    const retryAfterMs = Math.max(1000, freqWindowMs - (now - oldest));
    return { allowed: false, retryAfterMs };
  }
  arr.push(now);
  freqBuckets.set(actorUserId, arr);
  return { allowed: true };
}

// ── 路由 ──
export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as {
      input?: unknown;
      items?: Array<{ sku?: unknown; qty?: unknown }>;
      idempotency_key?: unknown;
      actor_userId?: unknown; // #24：限流按 actor 区分
    };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    const actorUserId = typeof body.actor_userId === "string" && body.actor_userId.trim() ? body.actor_userId.trim() : "alice";
    const items = Array.isArray(body.items)
      ? body.items.map((it) => ({ sku: String(it.sku ?? ""), qty: Number(it.qty ?? 0) }))
      : [];
    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";

    // ── #24 频率限流：每 actor 每分钟 ≤ 60 次 ──
    const freq = checkFreqLimit(actorUserId);
    if (!freq.allowed) {
      logger.warn("chat.freq-limit", "频率限流触发", "★ #24 教学点：限流 ≠ 幂等；这是频率维度，retryAfterMs 让前端/模型知道等多久", {
        actor: actorUserId,
        retryAfterMs: freq.retryAfterMs,
      });
      ctx.status = 429;
      ctx.body = {
        ok: false,
        code: "FREQ_LIMITED",
        error: `${actorUserId} 调用太频繁（每分钟 ≤ ${freqMax} 次）`,
        retryAfterMs: freq.retryAfterMs,
        status: "error",
      };
      return;
    }

    logger.info("chat.received", "POST /api/chat", "前端发来用户 input + items + idempotency_key；step-2 演示「模型发 create_order → 走幂等」", {
      input,
      items,
      idempotency_key: idempotencyKey,
      actor: actorUserId,
    });

    if (!input) {
      logger.warn("chat.bad-input", "input empty", "用户输入是空字符串", { body });
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    // ── Round 1：user msg → LLM 拿 tool_use ──
    // 强提示：模型必须调 create_order，并把 items + idempotency_key 传过去
    const SYSTEM_PROMPT = "你直接调用 create_order 工具（**不要做内部确认**——是否真的执行由后端 Tool Gateway 决定；失败会返结构化错误）。**create_order 必须填 idempotency_key**（由前端在 query 里告诉你）。这是教学 demo；如果不调工具，对应 Tool 的 Gateway 钩子没法演示，任务就算失败。";
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

    // ── Execute：每个 tool_use 过 Registry + create_order 幂等 ──
    const toolResults: ExecResult[] = toolUsesFromLLM.map((tu) => {
      // 优先用模型发的 args（含 idempotency_key）；如果模型没填用前端传的
      const args = tu.input || {};
      const finalArgs = {
        items: Array.isArray(args.items) && args.items.length > 0 ? args.items : items,
        idempotency_key: typeof args.idempotency_key === "string" && args.idempotency_key ? args.idempotency_key : idempotencyKey,
      };
      const r = executeTool("create_order", finalArgs, tu.id, {});
      const resultPayload = r.ok ? r.result : undefined;
      logger.info("chat.execute.result", "tool_result", "create_order 走完 Registry + 幂等；记 ok + cacheHit + dbInserted 摘要", {
        id: tu.id,
        ok: r.ok,
        cacheHit: (resultPayload as { cacheHit?: boolean } | undefined)?.cacheHit,
        dbInserted: (resultPayload as { dbInserted?: boolean } | undefined)?.dbInserted,
        order_id: (resultPayload as { order?: { order_id?: string } } | undefined)?.order?.order_id,
      });
      return r;
    });

    if (toolUsesFromLLM.length === 0) {
      const textBlocks = assistantContent1.filter(
        (b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text",
      );
      const directReply = textBlocks.map((b) => b.text).join("");
      logger.info("chat.no-tool-call", "model 直接自然语言答", "模型没调 create_order", {
        contentPreview: directReply.slice(0, 80),
      });
      ctx.body = {
        user_input: input,
        items,
        idempotency_key: idempotencyKey || null,
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
      items,
      idempotency_key: idempotencyKey || null,
      round_1: r1,
      model_tool_uses: toolUsesFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalText,
    };
    logger.info("chat.reply.sent", "responded to client", "已返回；含 4 张数据卡 + 钩子判定链", { status: 200 });
  });
}