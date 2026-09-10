/**
 * 职责：本 step 两条路径共用的轨迹形状（圈 / 计划步 / 执行痕迹）。
 * 数据流：flow 产出这些对象 → route 原样写入 ctx.body → 前端按字段渲染卡片。
 * 为什么单独成文件：对照两侧 route 不该各抄一份类型，改字段时只改这里。
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
};

export const DEFAULT_TASK = "春季上新：拉库存、给有货 SKU 写文案、通知运营";
