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
 * 日志（§5.3.16）：gateway.rejected / zod.fail / execute.ok / execute.fail / decide.next-action 都打。
 */
import { z } from "zod";
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
    logger.warn("registry.gateway.rejected", "未注册工具", "LLM 想调的工具不在白名单", { name, reason });
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    const reason = `dangerous tool ${name} requires manual approval`;
    logger.warn("registry.gateway.rejected", "危险工具", "工具被标 dangerous", { name, reason });
    return { allowed: false, reason };
  }
  logger.debug("registry.gateway.allowed", "gateway 放行", "工具通过 gateway 校验", { name });
  return { allowed: true };
}

// ── 统一执行入口 ──
export async function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): Promise<ExecResult> {
  // ① Gateway 先过
  const gate = gatewayCheck(name);
  if (!gate.allowed) {
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" };
  }

  // ② Zod 校验参数
  const tool = TOOLS[name as ToolName];
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    logger.warn("registry.zod.fail", "参数 Zod 校验失败", "工具名合法但参数 schema 不匹配", { name, toolCallId, issues });
    return {
      ok: false,
      tool: name,
      tool_call_id: toolCallId,
      error: `Zod parse failed: ${JSON.stringify(issues)}`,
    };
  }

  // ③ 真正执行（async handler）
  try {
    const result = await tool.handler(parsed.data);
    logger.info("registry.execute.ok", "执行成功", "工具实际跑通", { name, toolCallId, resultPreview: summarize(result) });
    return { ok: true, tool: name, tool_call_id: toolCallId, result };
  } catch (err: unknown) {
    logger.error("registry.execute.fail", "执行抛错", "handler 内部抛异常", { name, toolCallId, err: err instanceof Error ? err.message : String(err) });
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
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
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
  // Round 1: 总是先 search_doc 用原 query
  if (round === 1) {
    logger.info("decide.next-action", "Round 1 决定", "模型第一步：search_doc(originalQuery)", { originalQuery });
    return {
      kind: "tool_call",
      tool: "search_doc",
      arguments: { query: originalQuery },
      tool_call_id: `call_${round}`,
    };
  }

  // Round 2+: 看上一轮 tool_result 决定
  if (!lastResult || !lastResult.ok) {
    // 上一轮失败了 —— 真实场景下模型会看 error 决定换方案；这里简化：直接 final 报 error
    logger.info("decide.next-action", "上一轮失败 → final", "模型看到 ok:false / error → 决定不再调，返 error 当 final", { round });
    return {
      kind: "final",
      content: `(模型自纠终止：上一轮 tool_result 失败：${lastResult?.ok === false ? lastResult.error : "无结果"})`,
    };
  }

  // 上一轮是 search_doc
  if (lastResult.tool === "search_doc") {
    const c = lastResult.result as { query: string; hits: { title: string; snippet: string }[] };
    const hits = c.hits ?? [];
    if (hits.length === 0) {
      // ── 自纠触发 ──
      const broadened = `${originalQuery} 原理 实践`;
      logger.info("decide.next-action", "空 hits → 自纠", "模型看到 tool_result.hits=[] → 决定扩 query 重试 search_doc", {
        fromQuery: originalQuery,
        toQuery: broadened,
        round,
      });
      return {
        kind: "tool_call",
        tool: "search_doc",
        arguments: { query: broadened },
        tool_call_id: `call_${round}`,
      };
    }
    // 拿到 hits → summarize
    logger.info("decide.next-action", "拿到 hits → summarize", "模型看到 tool_result.hits 非空 → 决定调 summarize", { hitCount: hits.length, round });
    return {
      kind: "tool_call",
      tool: "summarize",
      arguments: { content: lastResult.result, style: "tech" },
      tool_call_id: `call_${round}`,
    };
  }

  // 上一轮是 summarize → final（直接拿 summary 当 final_reply）
  const c = lastResult.result as { summary?: string };
  logger.info("decide.next-action", "summarize 完成 → final", "模型拿到 summary → 决定不再调，返 final", { round });
  return {
    kind: "final",
    content: c?.summary ?? "(无 summary)",
  };
}