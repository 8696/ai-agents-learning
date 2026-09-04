/**
 * 职责：Tool Registry —— 所有 Tool 的注册中心 + 统一执行入口 + Gateway 校验。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 * 为什么单独成文件：
 *   - 新增 Tool 不改核心代码（lib/tools/ 里加一个文件，registry 数组多挂一行）
 *   - 所有 Tool 共享同一道 Gateway（统一权限 / 配额 / 危险操作校验）
 *   - 业务端（routes/chat.ts）只面对 executeTool()，不直接 import 每个 Tool
 *
 * 教学锚点（这一刀覆盖 §05-Tool-Calling-04 Tool Gateway / 幂等的"请求 ≠ 执行"一刀）：
 *   模型发出 tool_call ≠ 允许执行 —— gatewayCheck 在 execute 前必须跑过；
 *   dangerous 工具 / 未注册工具都被拦下，回灌 tool_result 时返回 { ok:false, error } 让模型能自纠。
 *
 * 日志（§5.3.16）：gateway.rejected / zod.fail / execute.ok / execute.fail 四类都打。
 */
import { z } from "zod";
import { getWeatherTool } from "./get-weather.js";
import { searchTool } from "./search.js";
import { calcTool } from "./calc.js";
import { logger } from "../logger.js";

// ── 注册表：name → Tool 完整定义 ──
// 新增 Tool 只要在这里多挂一行 + 在 lib/tools/ 加一个文件。其它代码不动。
const TOOLS = {
  [getWeatherTool.name]: getWeatherTool,
  [searchTool.name]: searchTool,
  [calcTool.name]: calcTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export type ExecResult =
  | { ok: true; tool: string; tool_call_id: string; result: unknown }
  | { ok: false; tool: string; tool_call_id: string; error: string };

// ── Gateway 校验：模型"决定" ≠ "已执行"的关键 ──
// 生产里这里还应该做：用户鉴权、配额限流、白名单、敏感字段过滤、人类审批。
// 本 demo 只演示两道闸：未注册工具 + dangerous 工具。
function gatewayCheck(name: string): { allowed: boolean; reason?: string } {
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    const reason = `unknown tool: ${name}（未注册）`;
    logger.warn("registry.gateway.rejected", "未注册工具", "LLM 想调的工具不在白名单；不能让未注册的工具被执行，记录 name + reason 便于排查 prompt 模板错", { name, reason });
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    const reason = `dangerous tool ${name} requires manual approval（gateway 拒绝；本 demo 默认拦截）`;
    logger.warn("registry.gateway.rejected", "危险工具", "工具被标 dangerous（如 shell_exec / write_file）；即使 LLM 提到也直接拦掉，记录 name + reason 便于审计防误调", { name, reason });
    return {
      allowed: false,
      reason,
    };
  }
  logger.debug("registry.gateway.allowed", "gateway 放行", "工具通过 gateway 校验（在白名单 + 非 dangerous）；可以放心进执行阶段", { name, dangerous: tool.dangerous });
  return { allowed: true };
}

// ── 统一执行入口：路由层调这一个函数 ──
// 真实场景里这层还应该包：超时（AbortController）、重试、埋点。
export function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): ExecResult {
  // ① Gateway 先过
  const gate = gatewayCheck(name);
  if (!gate.allowed) {
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" };
  }

  // ② Zod 校验参数（防模型解析错 / 注入）
  const tool = TOOLS[name as ToolName];
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    logger.warn("registry.zod.fail", "参数 Zod 校验失败", "工具名合法但参数 schema 不匹配；可能 LLM 生成了错结构，记录 issues 让 round-2 模型能看懂错在哪、怎么改", { name, toolCallId, issues });
    return {
      ok: false,
      tool: name,
      tool_call_id: toolCallId,
      error: `Zod parse failed: ${JSON.stringify(issues)}`,
    };
  }

  // ③ 真正执行
  // @ts-ignore —— 三个 Tool 的 handler 签名不同，TS 看成联合；运行时安全（Zod 已校验）
  const result = tool.handler(parsed.data);
  logger.info("registry.execute.ok", "执行成功", "工具实际跑通；只打 result 摘要（不打全文），便于核对返回结构又不撑爆日志", { name, toolCallId, resultPreview: summarize(result) });
  return { ok: true, tool: name, tool_call_id: toolCallId, result };
}

// 大对象 / 字符串截断，避免日志太长
function summarize(v: unknown): unknown {
  try {
    const s = JSON.stringify(v);
    if (s.length <= 200) return v;
    return JSON.parse(s.slice(0, 200) + "…");
  } catch {
    return String(v).slice(0, 200);
  }
}

// ── 给前端"Registry 面板"用：列出所有 Tool 的元信息（不含 schema） ──
// 浏览器只要看 name / description / dangerous；handler 不外传。
export function getToolsMeta() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
}

// ── step-2 新增：给 LLM 用的工具 schema（OpenAI Chat Completions tools 格式） ──
// 把每个 Tool 的 Zod schema 转成 JSON Schema，让模型知道参数应该长啥样。
// 不引 zod-to-json-schema；本 demo 三个 Tool 都是 z.object + z.string，简单手写就够。
// 生产里换成 zod-to-json-schema（或 SDK 内置函数）即可。
function buildParametersJsonSchema(schema: z.ZodTypeAny): {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required: string[];
} {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape)) {
      // 本 demo 三个 Tool 字段都是 z.string(.min(1))；optional 通过 !isOptional 判断
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

export function getToolNames(): ToolName[] {
  return Object.keys(TOOLS) as ToolName[];
}
