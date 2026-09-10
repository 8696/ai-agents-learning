/**
 * 职责：本 step 两条路径共用的轨迹形状 + 短/长任务文案。
 * 数据流：flow 产出这些对象 → route 原样写入 ctx.body → 前端按字段渲染卡片。
 * 为什么单独成文件：对照两侧 route 不该各抄一份类型；短/长任务文案只在这里改一次。
 */

export type ToolCall = { tool: string; args: Record<string, unknown> };

export type ToolResult = {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  ok: boolean;
};

export type Round = {
  index: number;
  reason: { tool_calls: ToolCall[]; thought: string };
  act: ToolResult[];
  costMs: number;
};

export type PlanStep = {
  index: number;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
};

export type ExecuteTrace = {
  index: number;
  step: PlanStep;
  result: ToolResult;
  costMs: number;
  planVersion: number;
};

export type Observation = { tool: string; args: Record<string, unknown>; result: unknown };

export type PlanVersion = {
  version: number;
  steps: PlanStep[];
  rawText: string;
  fallback: boolean;
  reason?: string;
};

export const SHORT_TASK = "把 todo-001 标完成";
export const LONG_TASK = "春季上新：拉库存、给有货 SKU 写文案、通知运营";
export const DEFAULT_TASK = LONG_TASK;
export const MAX_ROUNDS = 8;

export function resolveTask(raw: string | undefined): string {
  if (!raw || raw === "long") return LONG_TASK;
  if (raw === "short") return SHORT_TASK;
  return raw;
}
