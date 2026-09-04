/**
 * 职责：Tool Registry —— 2 个 Tool（search_doc + summarize）+ 统一执行入口 + Gateway 校验。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 * 为什么单独成文件：
 *   - 新增 Tool 不改核心代码（lib/tools/ 里加一个文件，registry 数组多挂一行）
 *   - 所有 Tool 共享同一道 Gateway（统一权限 / 配额 / 危险操作校验）
 *   - 业务端（routes/chain.ts）只面对 executeTool()，不直接 import 每个 Tool
 *
 * step-4 vs step-3：本 Registry 只有 2 个 Tool（search_doc + summarize）—— 是 chain 链 A → B。
 *   step-3 的 3 个 Tool（search_flight / get_weather / get_packing_list）走并行场景，**不**进 step-4。
 *   独立性（§5.3.12）：本 Registry 不 import step-3 的 tools；step-4 是独立 mock demo。
 *
 * 教学锚点（覆盖 MD 例子 5 · 串行依赖 + 选型准则"用串行的场景"）：
 *   - search_doc 是链 A（上游）→ 它的 result 会原样喂给 summarize.content
 *   - summarize 是链 B（下游）→ 它的 content 参数**必须**是 search_doc 的结果，不是用户输入
 *   - 路由层 hard-code：await search_doc → await summarize(search_doc.result)；**不**用 Promise.all
 *
 * 日志（§5.3.16）：gateway.rejected / zod.fail / execute.ok / execute.fail 四类都打。
 */
import { searchDocTool } from "./chain-search-doc.js";
import { summarizeTool } from "./chain-summarize.js";
import { logger } from "../logger.js";

// ── 注册表：name → Tool 完整定义 ──
const TOOLS = {
  [searchDocTool.name]: searchDocTool,
  [summarizeTool.name]: summarizeTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export type ExecResult =
  | { ok: true; tool: string; tool_call_id: string; result: unknown }
  | { ok: false; tool: string; tool_call_id: string; error: string };

// ── Gateway 校验：模型"决定" ≠ "已执行"的关键 ──
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

// ── 统一执行入口：路由层调这一个函数 ──
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
    // @ts-ignore
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

// ── step-4 chain 固定 2 个 tool_call（路由层 hard-code 串行）──
// 模型决定的版本详 02 / 04 章；本 demo 让路由层决定 A → B 顺序，便于教学观察。
export type MockToolCall = { id: string; name: string; arguments: Record<string, unknown> };

/**
 * 返回 chain 的第一步 tool_call（search_doc）。
 * 路由层先 await executeTool 这一步，再决定下一步（summarize）参数。
 */
export function chainFirstCall(query: string): MockToolCall[] {
  return [{ id: "call_1", name: "search_doc", arguments: { query } }];
}

/**
 * 返回 chain 的第二步 tool_call（summarize）。
 * **content = 上一步 search_doc 的 result**——这是依赖链的关键。
 */
export function chainSecondCall(firstResult: unknown, style: string): MockToolCall[] {
  return [{ id: "call_2", name: "summarize", arguments: { content: firstResult, style } }];
}
