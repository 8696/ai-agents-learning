/**
 * 职责：POST /api/compare-baseline + /api/compare-improved —— 跨 Provider 兼容对照。
 * 数据流：
 *   POST /api/compare-baseline { query } → 协议 A（OpenAI）· 同一份 Tool schema → tool_call
 *   POST /api/compare-improved { query } → 协议 B（Anthropic）· 同一份 Tool schema → tool_use
 *   前端两次 fetch 拿两侧结果，DiffTable 对比 protocol-level 差异
 *
 * 教学锚点（变体 6「跨 Provider 兼容」）：
 *   - 同一份 Tool schema + 同一个 user query，分别走 OpenAI 和 Anthropic
 *   - 两家 Provider 是否都能正确理解 schema、做出一致的 tool_call → 跨 Provider 可迁移的证据
 *   - 不真正 execute tool_call（执行是 01 那条已讲）；本条只对照「两家 Provider 的调用结果」
 *
 * 日志（§5.3.16）：详细优先；compare.{side}.received → 调用函数 → 调用模型 → compare.{side}.sent ｜ 任一处失败独立 error。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { callProtocolA, type ChatMsg, type ProtocolARequest, type ProtocolAResponse, type ToolSchema } from "../lib/llm/protocol-a.js";
import { getLlm } from "../../../llm.js";
import { getImprovedTools, type CompareSide, type ProtocolARequestForLog, type ProtocolAResponseForLog } from "../lib/tools/compare-sets.js";
import { callProtocolB, openAIToAnthropicSchema, type ProtocolBRequest, type ProtocolBResponse } from "../lib/llm/protocol-b.js";
import { logger } from "../lib/logger.js";

// ── 入参 Zod 校验（§5.3.12）──
const compareInputSchema = z.object({
  query: z.string().trim().min(1, "query 不能为空"),
});

// ── 当前进程用的模型 id（启动时拿一次；缺 Key 这里抛，路由层不会进） ──
let cachedModelA = "";
try {
  cachedModelA = getLlm().modelA;
} catch {
  cachedModelA = "(未配置)";
}

// ── 一次 LLM 调用（单轮） + 兜底（request 始终带回去，让前端能看到「我发了什么」） ──
type CallOnceResult =
  | { ok: true; request: ProtocolARequest; response: ProtocolAResponse }
  | { ok: false; request: ProtocolARequest; error: string; upstreamStatus?: number };

async function callLlmOnce(scope: string, tools: ToolSchema[], query: string): Promise<CallOnceResult> {
  let modelId = cachedModelA;
  if (modelId === "(未配置)") {
    try {
      modelId = getLlm().modelA;
      cachedModelA = modelId;
    } catch (err: unknown) {
      logger.error(`${scope}.no-key`, "未配置 LLM Key", "apps/.env 没配当前 provider 的 Key；这是阻塞性错误必须立刻告诉用户怎么修", { err: err instanceof Error ? err.message : String(err) });
      return {
        ok: false,
        request: { model: "?", messages: [{ role: "user", content: query }], tools, tool_choice: "auto" },
        error: "未配置 LLM Key：" + (err instanceof Error ? err.message : String(err)),
      };
    }
  }

  const messages: ChatMsg[] = [{ role: "user", content: query }];
  const request: ProtocolARequest = {
    model: modelId,
    messages,
    tools,
    tool_choice: "auto",
  };

  logger.info(`${scope}.start`, `→ openai.chat.completions.create（${scope}）`, "本 Demo 的核心出网点：拿模型对这一组 tools 的 tool_call 选择", {
    model: request.model,
    messagesCount: request.messages.length,
    toolsCount: request.tools?.length ?? 0,
    tool_choice: request.tool_choice,
    __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
  });

  try {
    const response = await callProtocolA(request);
    const toolCalls = response.choices[0]?.message?.tool_calls ?? [];
    logger.info(`${scope}.ok`, `← got response（${scope}）`, "完整打响应便于追 SDK 行为；记下 pickedToolName 用于前端对照", {
      finishReason: response.choices[0]?.finish_reason,
      pickedToolName: toolCalls[0]?.function.name ?? null,
    });
    return { ok: true, request, response };
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    const upstreamStatus = e.status;
    const msg = e.error?.message || e.message || String(err);
    logger.error(`${scope}.error`, "callProtocolA threw", "协议 A 抛异常（网络 / 5xx / 4xx）；记 upstreamStatus + 错误信息便于排错", { upstreamStatus, err: msg });
    return { ok: false, request, error: msg, upstreamStatus };
  }
}

// ── 把内部 ProtocolARequest/Response 瘦成前端要的可视化形状（不带 SDK 内部细节）──
function toLogRequest(req: ProtocolARequest): ProtocolARequestForLog {
  return {
    model: req.model,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content ?? null })),
    tools: req.tools,
    tool_choice: typeof req.tool_choice === "string" ? req.tool_choice : "specified",
  };
}

function toLogResponse(res: ProtocolAResponse): ProtocolAResponseForLog {
  return {
    id: res.id,
    model: res.model,
    choices: res.choices.map((c) => ({
      index: c.index,
      message: {
        role: c.message.role,
        content: c.message.content ?? null,
        tool_calls: c.message.tool_calls,
      },
      finish_reason: c.finish_reason,
    })),
    usage: res.usage,
  };
}

// ── 一次对照结果（外层「调用函数」） ──
async function runOneSide(
  label: string,
  tools: ToolSchema[],
  query: string,
): Promise<CompareSide> {
  // 外层（封装）开始 —— 内部那次才是「调用模型」
  logger.info(`compare.call-${label}`, `调用函数开始：runOneSide（${label}）`, `跑这一侧（${label}）的 LLM 调用；里面那次才是真正出网`, {
    toolsCount: tools.length,
    __code: `const r = await callLlmOnce("${label}", tools, query);`,
  });
  const t0 = Date.now();
  const r = await callLlmOnce(`compare.${label}`, tools, query);
  if (!r.ok) {
    // 把 failure 也包成 CompareSide 给前端展示错误
    const empty: CompareSide = {
      label,
      tools,
      request: toLogRequest(r.request),
      response: { id: "", model: r.request.model, choices: [] },
      ok: false, // LLM 调用失败（catch 路径）
      pickedToolName: undefined,
      pickedToolArgs: null,
      elapsedMs: Date.now() - t0,
    };
    logger.error(`compare.call-${label}`, `调用函数结束：runOneSide（${label}）（失败）`, `LLM 调用失败；前端会看到错误信息`, {
      error: r.error,
      upstreamStatus: r.upstreamStatus,
      耗时ms: Date.now() - t0,
    });
    return empty;
  }
  const toolCalls = r.response.choices[0]?.message?.tool_calls ?? [];
  const picked = toolCalls[0] ?? null;
  let pickedArgs: unknown = null;
  if (picked) {
    try {
      pickedArgs = JSON.parse(picked.function.arguments);
    } catch {
      pickedArgs = picked.function.arguments; // 解析失败就把原文放回去
    }
  }
  const out: CompareSide = {
    label,
    tools,
    request: toLogRequest(r.request),
    response: toLogResponse(r.response),
    ok: true, // LLM 调用成功
    pickedToolName: picked?.function.name ?? null, // null = 模型主动没调 tool（合法）
    pickedToolArgs: pickedArgs,
    elapsedMs: Date.now() - t0,
  };
  logger.info(`compare.call-${label}`, `调用函数结束：runOneSide（${label}）`, `这一侧跑完；记 pickedToolName 给前端对照`, {
    pickedToolName: out.pickedToolName,
    耗时ms: Date.now() - t0,
  });
  return out;
}

// ── 路由（单 Tool 独立调用模式：每个端点独立调一次 LLM，前端两次 fetch 拿 baseline + improved） ──
export function mountCompareRoutes(router: Router): void {
  // 单端点 helper：调一次 LLM，返回 CompareSide + elapsedMs
  async function handleOneSide(ctx: Context, side: "baseline" | "improved"): Promise<void> {
    const parsed = compareInputSchema.safeParse(ctx.request.body ?? {});
    logger.info(`compare.${side}.received`, `POST /api/compare-${side}`, `step-6 跨 Provider 兼容：${side === "baseline" ? "协议 A · OpenAI" : "协议 B · Anthropic"} 调用同一份 Tool schema`, {
      bodyKeys: Object.keys((ctx.request.body ?? {}) as object),
    });
    if (!parsed.success) {
      logger.warn(`compare.${side}.bad-input`, "input 校验失败", "入参 schema 不通过；走 400", { issues: parsed.error.issues });
      ctx.status = 400;
      ctx.body = { error: "请求体不合法", issues: parsed.error.issues };
      return;
    }
    const { query } = parsed.data;
    // step-6 教学点 = 跨 Provider 兼容 → 两侧用同一份 Tool schema
    const tools = getImprovedTools();
    const label = side === "baseline" ? "协议 A · OpenAI" : "协议 B · Anthropic";
    const result = side === "baseline"
      ? await runOneSide(label, tools, query)
      : await runAnthropicSide(label, tools, query);
    if (!result.ok) {
      logger.error(`compare.${side}.fail`, `${label} LLM 调用失败`, "LLM 调失败（catch 路径）；返回 502", {});
      ctx.status = 502;
      ctx.body = { error: `${label} 调用失败，请查看 #env-info`, result };
      return;
    }
    logger.info(`compare.${side}.sent`, `${label} 响应`, "已返回给前端；记 pickedToolName + elapsedMs", {
      pickedToolName: result.pickedToolName,
      elapsedMs: result.elapsedMs,
    });
    ctx.body = result;
  }

  router.post("/api/compare-baseline", (ctx: Context) => handleOneSide(ctx, "baseline"));
  router.post("/api/compare-improved", (ctx: Context) => handleOneSide(ctx, "improved"));
}

// ── 协议 B 调用 helper（Anthropic Messages API）──
//   输入：OpenAI 格式 ToolSchema（与协议 A 同一份 schema）
//   步骤：openAIToAnthropicSchema 翻译 → 调协议 B → 解析 tool_use block → 转 OpenAI shape 给前端
async function runAnthropicSide(
  label: string,
  tools: ToolSchema[],
  query: string,
): Promise<CompareSide> {
  logger.info(`compare.call-${label}`, `调用函数开始：runAnthropicSide（${label}）`, `step-6 关键：协议 B 调同一份 Tool schema（schema 翻译 + tool_use 解析）`, {
    toolsCount: tools.length,
    __code: `await callProtocolB(req); // 翻译 schema + 解析 tool_use`,
  });
  const t0 = Date.now();
  let response: ProtocolBResponse | undefined;
  let errorMsg: string | undefined;
  let upstreamStatus: number | undefined;
  try {
    const llm = getLlm();
    const anthropicTools = openAIToAnthropicSchema(tools);
    const maxTokens = Number(process.env.LLM_ANTHROPIC_MAX_TOKENS ?? 1024);
    const req: ProtocolBRequest = {
      model: llm.modelB,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: query }],
      tools: anthropicTools,
      tool_choice: { type: "auto" },
    };
    response = await callProtocolB(req);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    upstreamStatus = e.status;
    errorMsg = e.error?.message || e.message || String(err);
    logger.error(`compare.call-${label}`, `调用函数结束：runAnthropicSide（${label}）（失败）`, `协议 B 调用失败；前端会看到错误信息`, {
      error: errorMsg,
      upstreamStatus,
      耗时ms: Date.now() - t0,
    });
    return {
      label,
      tools,
      request: { model: "?", messages: [{ role: "user", content: query }], tools: [], tool_choice: undefined },
      response: { id: "", model: "?", choices: [] },
      ok: false,
      pickedToolName: undefined,
      pickedToolArgs: null,
      elapsedMs: Date.now() - t0,
    };
  }
  if (!response) {
    return {
      label,
      tools,
      request: { model: "?", messages: [{ role: "user", content: query }], tools: [], tool_choice: undefined },
      response: { id: "", model: "?", choices: [] },
      ok: false,
      pickedToolName: undefined,
      pickedToolArgs: null,
      elapsedMs: Date.now() - t0,
    };
  }
  // 解析 tool_use block
  const toolUse = response.content.find((b) => b.type === "tool_use");
  const pickedToolName = toolUse ? toolUse.name : null;
  const pickedToolArgs = toolUse ? toolUse.input : null;
  // 模拟 OpenAI shape 让前端 OneCallCard + DiffTable 渲染逻辑不用改
  const textContent = response.content.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text).join("");
  const fakeResponse = {
    id: response.id,
    model: response.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: textContent || null,
        tool_calls: toolUse ? [{
          id: toolUse.id,
          type: "function",
          function: { name: toolUse.name, arguments: JSON.stringify(toolUse.input) },
        }] : undefined,
      },
      finish_reason: response.stop_reason === "tool_use" ? "tool_calls" : response.stop_reason,
    }],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
  logger.info(`compare.call-${label}`, `调用函数结束：runAnthropicSide（${label}）`, `协议 B 调完；记 pickedToolName + elapsedMs`, {
    pickedToolName,
    elapsedMs: Date.now() - t0,
  });
  return {
    label,
    tools,
    request: { model: response.model, messages: [{ role: "user", content: query }], tools: tools, tool_choice: "auto" },
    response: fakeResponse,
    ok: true,
    pickedToolName,
    pickedToolArgs,
    elapsedMs: Date.now() - t0,
  };
}
