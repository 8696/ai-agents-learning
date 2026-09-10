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
 * 日志（§5.3.16）：调用函数 五条日志（handlePostChat 封装层）；
 *   校验挡下（400）单独写 warn；子调用 callProtocolB / executeTool 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  executeTool,
  getToolsForLLM,
  type ToolContext,
  type ExecResult,
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
        "为什么写这条日志：apps/.env 没配当前 provider 的 Key；这是阻塞性错误必须立刻告诉用户怎么修。",
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
    "为什么写这条日志：route 只认这一层返回的 CallResult；里面那次才是真发网络请求（看「调用函数开始：callProtocolB」）。当前：即将调 callProtocolB，model / max_tokens / messagesCount / toolsCount 都要写。",
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
      "为什么写这条日志：route 要把 CallResult 写进 ctx.body 交给页面 stats 区；记 stopReason / toolUseCount 便于核对。",
      {
        返回值: {
          ok: true,
          stopReason: response.stop_reason,
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
      "为什么写这条日志：协议 B 抛异常（网络 / 5xx / 4xx）；记 upstreamStatus + 错误信息便于排错。",
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
    const body = (ctx.request.body ?? {}) as {
      input?: unknown;
      actor?: { userId?: unknown; role?: unknown };
      confirmToken?: unknown;
    };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    const actorUserId = typeof body.actor?.userId === "string" && body.actor.userId.trim() ? body.actor.userId.trim() : "alice";
    const actorRole = body.actor?.role === "user" ? "user" : "admin";
    const confirmToken = typeof body.confirmToken === "string" && body.confirmToken.trim() ? body.confirmToken.trim() : undefined;

    logger.info(
      "api.chat",
      "调用函数开始：handlePostChat",
      "为什么写这条日志：route 只认这一层返回的响应包；里面两轮 callLlmOnce + executeTool 是真正干活的那一层。当前：step-1 演示「模型发 tool_use → Gateway 三钩子 → 拒绝/通过/二次确认」。",
      {
        入参: { inputPreview: input.slice(0, 60), inputLen: input.length, actor: { userId: actorUserId, role: actorRole }, hasConfirmToken: Boolean(confirmToken) },
        __code: `const ctxStore = { actor, confirmToken };\nconst r1 = await callLlmOnce(messages1, SYSTEM_PROMPT); // round-1\n// ... executeTool + round-2`,
      },
    );

    if (!input) {
      logger.warn(
        "api.chat",
        "调用函数结束：handlePostChat（校验拒绝）",
        "为什么写这条日志：用户输入是空字符串；走 400 不让 round-1 浪费 token。",
        {
          返回值: { httpStatus: 400, error: "input 不能为空" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "input 不能为空" };
      return;
    }

    const ctxStore: ToolContext = {
      actor: { userId: actorUserId, role: actorRole },
      confirmToken,
    };

    const SYSTEM_PROMPT = "你必须直接调用 delete_user 工具（输入 user_id 与 reason）。**不要做内部确认**——是否真的删除由后端 Tool Gateway 决定（鉴权/配额/二次确认）；后端会返结构化错误（NEEDS_CONFIRM/FORBIDDEN/RATE_LIMITED）时，你把错误翻译给用户即可。这是教学 demo；如果不调用工具，后端 Gateway 三钩子没法演示，任务就算失败。";
    const messages1: AnthropicChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1, SYSTEM_PROMPT);
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
      "为什么写这条日志：Round 1 模型决定；记 stopReason + toolNames 便于核对协议 B 物理形态。",
      {
        中间状态: { stopReason: r1.response.stop_reason, toolUseCount: toolUsesFromLLM.length, toolNames: toolUsesFromLLM.map((tu) => tu.name) },
      },
    );

    const toolResults: ExecResult[] = toolUsesFromLLM.map((tu) => {
      const args = tu.input;
      const r = executeTool(tu.name, args, tu.id, ctxStore);
      logger.info(
        "││ chat-handlePostChat",
        `tool_result（${tu.name}）`,
        "为什么写这条日志：Tool 走完 Registry + Gateway；打 ok + code + retryAfterMs 摘要（#14 端到端透传）。",
        {
          中间状态: { toolUseId: tu.id, name: tu.name, ok: r.ok, code: r.ok ? "OK" : r.code, retryAfterMs: r.ok ? undefined : r.retryAfterMs },
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
        "为什么写这条日志：模型没调 delete_user；可能是 query 不够触发。",
        {
          返回值: { httpStatus: 200, finalLen: directReply.length, contentPreview: directReply.slice(0, 80) },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
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

    const toolResultBlocks: AnthropicContentBlock[] = toolResults.map((r) => {
      const content = r.ok
        ? JSON.stringify(r.result)
        : JSON.stringify({ error: r.error, code: r.code, retryAfterMs: r.retryAfterMs });
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
        "为什么写这条日志：Round 2 失败；502 返回前端；记 error + upstreamStatus 便于排错。",
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
      "为什么写这条日志：Round 2 成功；拿到 final reply 准备返回。",
      {
        中间状态: { stopReason: r2.response.stop_reason, finalLen: finalText.length },
      },
    );

    logger.info(
      "api.chat",
      "调用函数结束：handlePostChat",
      "为什么写这条日志：route 要把响应包（4 张数据卡 + 钩子判定链）写进 ctx.body 交给页面 stats 区；记 finalLen 便于核对。",
      {
        返回值: { status: 200, finalLen: finalText.length, toolResultCount: toolResults.length, okCount: toolResults.filter(r => r.ok).length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

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
    void tHandlerStart;
  });
}