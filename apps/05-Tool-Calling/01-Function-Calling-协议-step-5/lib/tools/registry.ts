/**
 * 职责：Tool Registry —— 2 个 Tool（search_doc + summarize）+ 统一执行入口 + Gateway 校验 + 模型决策 mock。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 *
 * step-5 vs step-4：本 Registry **多了**一个 mock 函数 `decideNextAction` —— 模拟真实 LLM 在 while
 *   循环里的决策（看完上一轮 tool_result 决定下一步调什么 / 还是停）。
 *   step-4 是路由层 hard-code A → B 链；step-5 是"模型自己编排 + 自纠"（含空结果触发重试）。
 *
 * 教学锚点（覆盖 MD 例子 5.5 + 错误恢复闭环）：
 *   - while 循环骨架：`while (rounds < MAX)` + 每轮调 `decideNextAction` 看 tool_result 决定下一步
 *   - 自纠：search_doc 返空 hits → 模型换 query → 重试 → 拿到 hits → 调 summarize
 *   - MAX_ROUNDS 边界：超 8 轮未收敛 → 业务降级（返 structured error）
 *
 * 日志（§5.3.16）：executeTool 是主路径——函数体逐步写满五条日志（含 __code + 字段释义）；
 *   gatewayCheck / getToolsMeta / decideNextAction 是普通函数——五条日志（含 __code）仍要。
 */
import { searchDocTool } from "./chain-search-doc.js";
import { summarizeTool } from "./chain-summarize.js";
import { logger } from "../logger.js";

// ── 注册表 ──
const TOOLS = {
  [searchDocTool.name]: searchDocTool,
  [summarizeTool.name]: summarizeTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export type ExecResult =
  | { ok: true; tool: string; tool_call_id: string; result: unknown }
  | { ok: false; tool: string; tool_call_id: string; error: string };

// ── Gateway 校验 ──
function gatewayCheck(name: string): { allowed: boolean; reason?: string } {
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    const reason = `unknown tool: ${name}（未注册）`;
    logger.warn(
      "│ 网关-gatewayCheck",
      "调用函数结束：gatewayCheck",
      "为什么写这条日志：未注册工具被拦；LLM 想调的工具不在白名单。warn 是「业务失败但能走通」的等级。",
      {
        返回值: { allowed: false, reason },
        name,
        耗时ms: Date.now(),
      },
    );
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    const reason = `dangerous tool ${name} requires manual approval`;
    logger.warn(
      "│ 网关-gatewayCheck",
      "调用函数结束：gatewayCheck（dangerous）",
      "为什么写这条日志：工具被标 dangerous；即使 LLM 提到也直接拦掉。",
      {
        返回值: { allowed: false, reason },
        name,
        耗时ms: Date.now(),
      },
    );
    return { allowed: false, reason };
  }
  logger.debug(
    "│ 网关-gatewayCheck",
    "调用函数结束：gatewayCheck",
    "为什么写这条日志：debug 是「细节」等级；gateway 放行是高频路径。",
    {
      返回值: { allowed: true },
      name,
      耗时ms: Date.now(),
    },
  );
  return { allowed: true };
}

// ── 统一执行入口 ──
export async function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): Promise<ExecResult> {
  const tFuncStart = Date.now();
  logger.info(
    "│ 工具执行-executeTool",
    "调用函数开始：executeTool",
    "为什么写这条日志：route 只认这一层返回的 ExecResult；所有 Tool 共用同一道 Gateway。当前：handler 是 async → 路由层自己决定 await 还是 Promise.all。",
    {
      入参: { toolCallId, name, rawArgs: args },
      __code: `const gate = gatewayCheck(name);\nconst parsed = tool.schema.safeParse(args);\nconst result = await tool.handler(parsed.data);`,
    },
  );

  // ① Gateway 先过
  const gate = gatewayCheck(name);
  if (!gate.allowed) {
    logger.warn(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（gateway 拒绝）",
      "为什么写这条日志：未注册工具或 dangerous 工具被拦；回灌 tool_result 时返回 ok:false 让模型能自纠。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" },
        reason: gate.reason,
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" };
  }

  // ② Zod 校验参数
  const tool = TOOLS[name as ToolName];
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    logger.warn(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（Zod 校验失败）",
      "为什么写这条日志：工具名合法但参数 schema 不匹配。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: `Zod parse failed: ${JSON.stringify(issues)}` },
        issues: JSON.parse(JSON.stringify(issues)),
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return {
      ok: false,
      tool: name,
      tool_call_id: toolCallId,
      error: `Zod parse failed: ${JSON.stringify(issues)}`,
    };
  }

  // ③ 真正执行（async handler）
  try {
    // @ts-ignore
    const result = await tool.handler(parsed.data);
    logger.info(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool",
      "为什么写这条日志：工具实际跑通；只写 result 摘要。",
      {
        返回值: { ok: true, tool: name, tool_call_id: toolCallId, resultPreview: summarize(result) },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { ok: true, tool: name, tool_call_id: toolCallId, result };
  } catch (err: unknown) {
    logger.error(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（失败）",
      "为什么写这条日志：handler 内部抛异常；回灌 tool_result 时按失败处理，不让外层断片。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: err instanceof Error ? err.message : String(err) },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
    return { ok: false, tool: name, tool_call_id: toolCallId, error: err instanceof Error ? err.message : String(err) };
  }
}

function summarize(v: unknown): unknown {
  try {
    const s = JSON.stringify(v);
    if (s.length <= 200) return v;
    return JSON.parse(s.slice(0, 200) + "…");
  } catch {
    return String(v).slice(0, 200);
  }
}

// ── 给前端"Registry 面板"用 ──
export function getToolsMeta() {
  const t0 = Date.now();
  const meta = Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
  logger.debug(
    "│ Registry-getToolsMeta",
    "调用函数结束：getToolsMeta",
    "为什么写这条日志：debug 是「细节」等级；前端 Tool Registry 面板拉一次是高频路径。",
    {
      返回值: { count: meta.length, tools: meta },
      耗时ms: Date.now() - t0,
    },
  );
  return meta;
}

// ───────────────────────────────────────────────────────────────────
// step-5 核心：mock LLM 决策（decideNextAction）
//
// 真实 Agent 里这个函数是 LLM 调用：`llm.chat({ messages, tools })` → 拿 assistantMsg.tool_calls / null
// step-5 用纯函数模拟这个决策，让 demo 确定性可复现（不依赖真实模型行为）。
//
// 决策规则（教学演示用）：
//   - 第一次：search_doc(originalQuery) → 看结果
//   - 如果 search_doc 返空 hits → 自纠：search_doc(query + " 原理 实践")（扩 query）
//   - 如果 search_doc 拿到 hits → summarize(content=hits, style="tech")
//   - summarize 完成 → final（返 summary 当 final reply）
// ───────────────────────────────────────────────────────────────────

export type Decision =
  | { kind: "tool_call"; tool: string; arguments: Record<string, unknown>; tool_call_id: string }
  | { kind: "final"; content: string };

export function decideNextAction(
  round: number,
  originalQuery: string,
  lastResult: ExecResult | null,
): Decision {
  const t0 = Date.now();
  logger.info(
    "│ mock 决策-decideNextAction",
    "调用函数开始：decideNextAction",
    "为什么写这条日志：route 只认这一层返回的 Decision；每轮路由层调用它决定下一步。当前：mock 模型在 while 循环里看上一轮 tool_result 决定下一步。",
    {
      入参: { round, originalQuery, hasLastResult: Boolean(lastResult) },
      __code: `if (round === 1) return { kind: "tool_call", tool: "search_doc", arguments: { query: originalQuery } };\n// ... 看 lastResult 决定下一步`,
    },
  );

  // Round 1: 总是先 search_doc 用原 query
  if (round === 1) {
    const decision: Decision = {
      kind: "tool_call",
      tool: "search_doc",
      arguments: { query: originalQuery },
      tool_call_id: `call_${round}`,
    };
    logger.info(
      "│ mock 决策-decideNextAction",
      "调用函数结束：decideNextAction",
      "为什么写这条日志：Round 1 模型第一步：search_doc(originalQuery)。",
      {
        返回值: { decision: { kind: decision.kind, tool: decision.kind === "tool_call" ? decision.tool : undefined, arguments: decision.kind === "tool_call" ? decision.arguments : undefined } },
        耗时ms: Date.now() - t0,
      },
    );
    return decision;
  }

  // Round 2+: 看上一轮 tool_result 决定
  if (!lastResult || !lastResult.ok) {
    // 上一轮失败了 —— 真实场景下模型会看 error 决定换方案；这里简化：直接 final 报 error
    const decision: Decision = {
      kind: "final",
      content: `(模型自纠终止：上一轮 tool_result 失败：${lastResult?.ok === false ? lastResult.error : "无结果"})`,
    };
    logger.info(
      "│ mock 决策-decideNextAction",
      "调用函数结束：decideNextAction",
      "为什么写这条日志：模型看到 ok:false / error → 决定不再调，返 error 当 final。",
      {
        返回值: { decision: { kind: "final", contentPreview: decision.content.slice(0, 50) } },
        耗时ms: Date.now() - t0,
      },
    );
    return decision;
  }

  // 上一轮是 search_doc
  if (lastResult.tool === "search_doc") {
    const c = lastResult.result as { query: string; hits: { title: string; snippet: string }[] };
    const hits = c.hits ?? [];
    if (hits.length === 0) {
      // ── 自纠触发 ──
      const broadened = `${originalQuery} 原理 实践`;
      const decision: Decision = {
        kind: "tool_call",
        tool: "search_doc",
        arguments: { query: broadened },
        tool_call_id: `call_${round}`,
      };
      logger.info(
        "│ mock 决策-decideNextAction",
        "调用函数结束：decideNextAction",
        "为什么写这条日志：模型看到 tool_result.hits=[] → 决定扩 query 重试 search_doc（自纠触发）。",
        {
          返回值: { decision: { kind: "tool_call", tool: "search_doc", arguments: decision.arguments }, fromQuery: originalQuery, toQuery: broadened },
          耗时ms: Date.now() - t0,
          字段释义: {
            自纠: "空 hits → 改 query 重新搜（典型模型自纠模式）",
          },
        },
      );
      return decision;
    }
    // 拿到 hits → summarize
    const decision: Decision = {
      kind: "tool_call",
      tool: "summarize",
      arguments: { content: lastResult.result, style: "tech" },
      tool_call_id: `call_${round}`,
    };
    logger.info(
      "│ mock 决策-decideNextAction",
      "调用函数结束：decideNextAction",
      "为什么写这条日志：模型看到 tool_result.hits 非空 → 决定调 summarize。",
      {
        返回值: { decision: { kind: "tool_call", tool: "summarize", arguments: { content: "(hits)", style: "tech" } }, hitCount: hits.length },
        耗时ms: Date.now() - t0,
      },
    );
    return decision;
  }

  // 上一轮是 summarize → final（直接拿 summary 当 final_reply）
  const c = lastResult.result as { summary?: string };
  const decision: Decision = {
    kind: "final",
    content: c?.summary ?? "(无 summary)",
  };
  logger.info(
    "│ mock 决策-decideNextAction",
    "调用函数结束：decideNextAction",
    "为什么写这条日志：模型拿到 summary → 决定不再调，返 final。",
    {
      返回值: { decision: { kind: "final", contentPreview: decision.content.slice(0, 50) } },
      耗时ms: Date.now() - t0,
    },
  );
  return decision;
}