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
 * 日志（§5.3.16）：executeTool 是主路径——函数体逐步写满五条日志（含 __code + 字段释义）；
 *   gatewayCheck / getToolsMeta / chainFirstCall / chainSecondCall 是普通函数——五条日志（含 __code）仍要。
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

// ── 统一执行入口：路由层调这一个函数 ──
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

// ── step-4 chain 固定 2 个 tool_call（路由层 hard-code 串行）──
// 模型决定的版本详 02 / 04 章；本 demo 让路由层决定 A → B 顺序，便于教学观察。
export type MockToolCall = { id: string; name: string; arguments: Record<string, unknown> };

/**
 * 返回 chain 的第一步 tool_call（search_doc）。
 * 路由层先 await executeTool 这一步，再决定下一步（summarize）参数。
 */
export function chainFirstCall(query: string): MockToolCall[] {
  const t0 = Date.now();
  logger.info(
    "│ mock chain-chainFirstCall",
    "调用函数结束：chainFirstCall",
    "为什么写这条日志：route 只认这一层返回的 MockToolCall[]；step-4 chain 第一步是 search_doc(query)。",
    {
      返回值: { count: 1, calls: [{ id: "call_1", name: "search_doc", arguments: { query } }] },
      耗时ms: Date.now() - t0,
    },
  );
  return [{ id: "call_1", name: "search_doc", arguments: { query } }];
}

/**
 * 返回 chain 的第二步 tool_call（summarize）。
 * **content = 上一步 search_doc 的 result**——这是依赖链的关键。
 */
export function chainSecondCall(firstResult: unknown, style: string): MockToolCall[] {
  const t0 = Date.now();
  logger.info(
    "│ mock chain-chainSecondCall",
    "调用函数结束：chainSecondCall",
    "为什么写这条日志：route 只认这一层返回的 MockToolCall[]；step-4 chain 第二步 summarize.content = 上一步 search_doc 的 result。",
    {
      返回值: { count: 1, calls: [{ id: "call_2", name: "summarize", arguments: { content: firstResult, style } }] },
      contentIsFirstResult: firstResult === undefined ? "undefined（反例路径）" : "已传值（正例路径）",
      耗时ms: Date.now() - t0,
    },
  );
  return [{ id: "call_2", name: "summarize", arguments: { content: firstResult, style } }];
}