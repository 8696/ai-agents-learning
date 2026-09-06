/**
 * 职责：Tool Registry —— 3 个 Tool + 统一执行入口 + Gateway 校验。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 *
 * step-6 vs step-2：本 Registry 的 Tool 数量相同（3 个），但 step-6 把 calc 标 dangerous:false
 *   （详 lib/tools/calc.ts 的注释）；gateway 闸只演示"未注册工具被拦"。
 *
 * 独立性（§5.3.12）：本 Registry 不 import step-1~5 的 tools；step-6 是独立 demo（虽然逻辑同 step-2）。
 *
 * 教学锚点（覆盖模块 05 · 01 · 协议层数据形态 + 编造检测可观察）：
 *   - 模型拿到的 tool schema（OpenAI Chat Completions tools 数组）从 Registry 派生
 *   - 真 LLM 调完拿到 tool_calls → executeTool 拿真 tool_result → 回灌 Round 2 → 模型生成 final_reply
 *   - 路由层 detectHallucination 自动扫 reply 数字 vs tool_result 数字差异
 *
 * 日志（§5.3.16）：gateway.rejected / zod.fail / execute.ok / execute.fail 四类都打。
 */
import { z } from "zod";
import { getWeatherTool } from "./get-weather.js";
import { searchTool } from "./search.js";
import { calcTool } from "./calc.js";
import { logger } from "../logger.js";

// ── 注册表：name → Tool 完整定义 ──
const TOOLS = {
  [getWeatherTool.name]: getWeatherTool,
  [searchTool.name]: searchTool,
  [calcTool.name]: calcTool,
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
    logger.warn("registry.gateway.rejected", "未注册工具", "LLM 想调的工具不在白名单；不能让未注册的工具被执行", { name, reason });
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    // step-6 三个 Tool 都标 false，此分支仅作防御性保留
    const reason = `dangerous tool ${name} requires manual approval`;
    logger.warn("registry.gateway.rejected", "危险工具", "工具被标 dangerous；即使 LLM 提到也直接拦掉", { name, reason });
    return { allowed: false, reason };
  }
  logger.debug("registry.gateway.allowed", "gateway 放行", "工具通过 gateway 校验", { name });
  return { allowed: true };
}

// ── 统一执行入口 ──
export function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): ExecResult {
  const gate = gatewayCheck(name);
  if (!gate.allowed) {
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" };
  }

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

  try {
    // @ts-ignore —— 三个 Tool 的 handler 签名不同，TS 看成联合；运行时安全（Zod 已校验）
    const result = tool.handler(parsed.data);
    logger.info("registry.execute.ok", "执行成功", "工具实际跑通；只打 result 摘要", { name, toolCallId, resultPreview: summarize(result) });
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

// ── 元信息 / LLM schema 派生（与 step-2 同构）──
export function getToolsMeta() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
}

function buildParametersJsonSchema(schema: z.ZodTypeAny): {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required: string[];
} {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape)) {
      properties[key] = { type: "string", description: `${key} 参数` };
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    return { type: "object", properties, required };
  }
  return { type: "object", properties: {}, required: [] };
}

export function getToolsForLLM() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
    parameters: buildParametersJsonSchema(t.schema),
  }));
}
