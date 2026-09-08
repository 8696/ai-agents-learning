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
 *
 * 日志（§5.3.16）：调用函数 五件套（handlePostChat 封装层）；
 *   闸门挡掉（400）单独打 warn；子调用 callLlmOnce / executeTool 内部已自带五件套。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { executeTool, getToolsForLLM, type ExecResult, type ToolContext } from "../lib/tools/registry.js";
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
    const body = (ctx.request.body ?? {}) as {
      input?: unknown;
      actor?: { userId?: unknown; role?: unknown };
    };
    const input = typeof body.input === "string" ? body.input.trim() : "";
    const actorUserId = typeof body.actor?.userId === "string" && body.actor.userId.trim() ? body.actor.userId.trim() : "alice";
    const actorRole = body.actor?.role === "god" ? "god" : body.actor?.role === "admin" ? "admin" : "user";

    logger.info(
      "api.chat",
      "调用函数开始：handlePostChat",
      "为什么打：route 只认这一层返回的响应包；里面两轮 callLlmOnce + executeTool 是「真活」。当前：step-3 演示「模型发 read_recent_emails → 走 per-user OAuth 三步」。",
      {
        入参: { inputPreview: input.slice(0, 60), inputLen: input.length, actor: { userId: actorUserId, role: actorRole } },
        __code: `// 强提示 → callLlmOnce → executeTool(read_recent_emails) → callLlmOnce(回灌) → final_reply`,
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

    const toolCtx: ToolContext = { actor: { userId: actorUserId, role: actorRole } };

    const SYSTEM_PROMPT = "你直接调用 read_recent_emails 工具（**不要做内部确认**——能否真的执行由后端 Tool Gateway 决定）。这是教学 demo；如果不调工具，对应 Tool 的 Gateway 钩子没法演示，任务就算失败。";
    const messages1: AnthropicChatMsg[] = [{ role: "user", content: input }];
    const r1 = await callLlmOnce(messages1, SYSTEM_PROMPT);
    if (!r1.ok) {
      logger.error(
        "api.chat",
        "调用函数结束：handlePostChat（round-1 失败）",
        "为什么打：Round 1 调模型失败；502 返回前端。",
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
      const finalArgs = {
        max: typeof args.max === "number" && args.max > 0 ? args.max : 5,
      };
      const r = executeTool("read_recent_emails", finalArgs, tu.id, toolCtx);
      const resultPayload = r.ok ? r.result : undefined;
      logger.info(
        "││ chat-handlePostChat",
        `tool_result（${tu.name}）`,
        "为什么打：read_recent_emails 走完 Registry + per-user OAuth；记 ok + code 摘要。",
        {
          中间状态: {
            toolUseId: tu.id,
            name: tu.name,
            ok: r.ok,
            code: r.ok ? "OK" : r.code,
            actor: (resultPayload as { actor?: string } | undefined)?.actor,
          },
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
        "为什么打：模型没调 read_recent_emails；可能是 query 不够触发。",
        {
          返回值: { httpStatus: 200, finalLen: directReply.length, contentPreview: directReply.slice(0, 80) },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
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
      "为什么打：route 要把响应包写进 ctx.body 交给页面 stats 区；含 4 张数据卡 + per-user OAuth 结果。",
      {
        返回值: { status: 200, finalLen: finalText.length, toolResultCount: toolResults.length, okCount: toolResults.filter(r => r.ok).length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    ctx.body = {
      user_input: input,
      actor: toolCtx.actor,
      round_1: r1,
      model_tool_uses: toolUsesFromLLM,
      tool_results: toolResults,
      round_2: r2,
      final_reply: finalText,
    };
  });
}