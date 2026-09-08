/**
 * 职责：POST /api/compare-baseline + /api/compare-improved —— 真调 LLM（协议 A），分别用「差描述」「好描述」两套 Tool。
 * 数据流：
 *   POST /api/compare-{baseline|improved} { query } →
 *     runOneSide(label, tools, query) → callLlmOnce → 拿 tool_call
 *     ctx.body = CompareSide
 *
 * 教学锚点（变体 1「触发条件」）：
 *   - 同一个 user query，两侧只换 description 字段
 *   - 模型的选择差异 = description 写得好不好的真实证据
 *   - 不真正 execute tool_call（执行是 01 那条已讲）；本条只对照「模型决定调哪个 Tool」
 *
 * 日志（§5.3.16）：调用函数 五件套（handleCompare{baseline|improved} / runOneSide / callLlmOnce 封装层）；
 *   闸门挡掉单独打 warn；子调用 callProtocolA 内部已自带五件套。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { callProtocolA, type ChatMsg, type ProtocolARequest, type ProtocolAResponse, type ToolSchema } from "../lib/llm/protocol-a.js";
import { getLlm } from "../../../llm.js";
import { getBaselineTools, getImprovedTools, type CompareSide, type ProtocolARequestForLog, type ProtocolAResponseForLog } from "../lib/tools/compare-sets.js";
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
  const tFuncStart = Date.now();
  let modelId = cachedModelA;
  if (modelId === "(未配置)") {
    try {
      modelId = getLlm().modelA;
      cachedModelA = modelId;
    } catch (err: unknown) {
      logger.error(
        `│ ${scope}-callLlmOnce`,
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

  logger.info(
    `│ ${scope}-callLlmOnce`,
    "调用函数开始：callLlmOnce",
    `为什么打：route 只认这一层返回的 CallOnceResult；里面那次才是出网（看「调用函数开始：callProtocolA」）。当前：即将调 callProtocolA，scope=${scope} 便于 grep。`,
    {
      入参: { model: request.model, messagesCount: request.messages.length, toolsCount: request.tools?.length ?? 0, tool_choice: request.tool_choice, queryPreview: query.slice(0, 60) },
      __code: `await callProtocolA(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const response = await callProtocolA(request);
    const toolCalls = response.choices[0]?.message?.tool_calls ?? [];
    logger.info(
      `│ ${scope}-callLlmOnce`,
      "调用函数结束：callLlmOnce",
      "为什么打：route 要把 CallOnceResult 写进 ctx.body 交给页面 stats 区；记 finishReason + pickedToolName 便于核对。",
      {
        返回值: {
          ok: true,
          finishReason: response.choices[0]?.finish_reason,
          pickedToolName: toolCalls[0]?.function.name ?? null,
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
      `│ ${scope}-callLlmOnce`,
      "调用函数结束：callLlmOnce（失败）",
      "为什么打：协议 A 抛异常（网络 / 5xx / 4xx）；记 upstreamStatus + 错误信息便于排错。",
      {
        返回值: { ok: false, error: msg, upstreamStatus },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
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
  const tFuncStart = Date.now();
  logger.info(
    `│ 对照-runOneSide[${label}]`,
    "调用函数开始：runOneSide",
    `为什么打：route 只认这一层返回的 CompareSide；里面那次才是出网（看「调用函数开始：callLlmOnce」）。当前：跑这一侧（${label}）的 LLM 调用。`,
    {
      入参: { label, toolsCount: tools.length, queryPreview: query.slice(0, 60) },
      __code: `const r = await callLlmOnce("compare.${label}", tools, query);`,
    },
  );

  const t0 = Date.now();
  const r = await callLlmOnce(`compare.${label}`, tools, query);
  if (!r.ok) {
    const empty: CompareSide = {
      label,
      tools,
      request: toLogRequest(r.request),
      response: { id: "", model: r.request.model, choices: [] },
      ok: false,
      pickedToolName: undefined,
      pickedToolArgs: null,
      elapsedMs: Date.now() - t0,
    };
    logger.error(
      `│ 对照-runOneSide[${label}]`,
      "调用函数结束：runOneSide（失败）",
      "为什么打：LLM 调用失败；前端会看到错误信息。",
      {
        返回值: { ok: false, pickedToolName: null },
        error: r.error,
        upstreamStatus: r.upstreamStatus,
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return empty;
  }
  const toolCalls = r.response.choices[0]?.message?.tool_calls ?? [];
  const picked = toolCalls[0] ?? null;
  let pickedArgs: unknown = null;
  if (picked) {
    try {
      pickedArgs = JSON.parse(picked.function.arguments);
    } catch {
      pickedArgs = picked.function.arguments;
    }
  }
  const out: CompareSide = {
    label,
    tools,
    request: toLogRequest(r.request),
    response: toLogResponse(r.response),
    ok: true,
    pickedToolName: picked?.function.name ?? null,
    pickedToolArgs: pickedArgs,
    elapsedMs: Date.now() - t0,
  };
  logger.info(
    `│ 对照-runOneSide[${label}]`,
    "调用函数结束：runOneSide",
    `为什么打：这一侧跑完；记 pickedToolName 给前端对照——这是 description 写得好不好的真实证据。`,
    {
      返回值: { ok: true, pickedToolName: out.pickedToolName, elapsedMs: out.elapsedMs },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return out;
}

// ── 路由（单 Tool 独立调用模式：每个端点独立调一次 LLM，前端两次 fetch 拿 baseline + improved） ──
export function mountCompareRoutes(router: Router): void {
  async function handleOneSide(ctx: Context, side: "baseline" | "improved"): Promise<void> {
    const tHandlerStart = Date.now();
    const parsed = compareInputSchema.safeParse(ctx.request.body ?? {});
    logger.info(
      `api.compare.${side}`,
      `调用函数开始：handleCompare${side}`,
      `为什么打：route 只认这一层返回的 CompareSide；里面 runOneSide 是「真活」。当前：前端发来一次独立调用请求；记 query 便于复现。`,
      {
        入参: { endpoint: `POST /api/compare-${side}`, bodyKeys: Object.keys((ctx.request.body ?? {}) as object) },
        __code: `const tools = side === "baseline" ? getBaselineTools() : getImprovedTools();\nconst result = await runOneSide(label, tools, query);`,
      },
    );
    if (!parsed.success) {
      logger.warn(
        `api.compare.${side}`,
        `调用函数结束：handleCompare${side}（闸门拒绝）`,
        "为什么打：入参 schema 不通过；走 400 不让 LLM 浪费 token。",
        {
          返回值: { httpStatus: 400, error: "请求体不合法" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 400;
      ctx.body = { error: "请求体不合法", issues: parsed.error.issues };
      return;
    }
    const { query } = parsed.data;
    const tools = side === "baseline" ? getBaselineTools() : getImprovedTools();
    const label = side === "baseline" ? "差描述" : "好描述";
    const result = await runOneSide(label, tools, query);
    if (!result.ok) {
      logger.error(
        `api.compare.${side}`,
        `调用函数结束：handleCompare${side}（失败）`,
        "为什么打：LLM 调失败（catch 路径）；返回 502。",
        {
          返回值: { httpStatus: 502, pickedToolName: result.pickedToolName },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
      ctx.status = 502;
      ctx.body = { error: `${label}侧 LLM 调用失败，请查看 #env-info`, result };
      return;
    }
    logger.info(
      `api.compare.${side}`,
      `调用函数结束：handleCompare${side}`,
      `为什么打：route 要把 CompareSide 写进 ctx.body 交给页面 stats 区；记 pickedToolName + elapsedMs 便于核对。`,
      {
        返回值: { status: 200, pickedToolName: result.pickedToolName, elapsedMs: result.elapsedMs },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
    ctx.body = result;
  }

  router.post("/api/compare-baseline", (ctx: Context) => handleOneSide(ctx, "baseline"));
  router.post("/api/compare-improved", (ctx: Context) => handleOneSide(ctx, "improved"));
}