/**
 * 职责：mock 模型 + mock 工具的纯函数。
 * 数据流：被 loop.ts / loop-step.ts 引用。
 * 为什么单独成文件：loop.ts 行数控制（≤280）；mock 函数抽出来。
 */

export function mockLlmStepContinue(stepIndex: number) {
  // step-7：每次调不同 sku（避免闸门 6 误触）— 主要演示 token budget
  const sku = `SKU-${String(stepIndex + 1).padStart(3, "0")}`;
  return {
    finishReason: "tool_calls",
    thought: `第 ${stepIndex + 1} 轮：模型决定查 ${sku}。`,
    toolCall: { name: "queryStock", args: { sku } },
    content: null,
  };
}

export function mockLlmStepStop(stepIndex: number) {
  return {
    finishReason: "stop",
    thought: `第 ${stepIndex + 1} 轮：模型决定结束（mock stop）。`,
    toolCall: null,
    content: "final_answer: mock 模型演示结束任务",
  };
}

/**
 * mock todo 工具：按 id 返回对应状态。
 * T001~T005 = pending（未开始）
 * T006~T007 = in_progress（进行中）
 * T008~T010 = done（已完成）
 */
export async function mockToolQueryTodo(id: string, latencyMs: number, flakyRate: number, alwaysFail: boolean, attempt: number): Promise<{ ok: boolean; payload?: unknown; latencyMs: number; error?: string }> {
  if (latencyMs > 0) await new Promise(r => setTimeout(r, latencyMs));
  const roll = Math.random();
  const fail = alwaysFail || roll < flakyRate;
  if (fail) {
    return { ok: false, latencyMs, error: `mock 工具模拟失败（attempt=${attempt}，roll=${roll.toFixed(2)}，flakyRate=${flakyRate}，alwaysFail=${alwaysFail}）` };
  }
  const num = parseInt(id.replace(/\D/g, ""), 10);
  let status: string;
  if (num >= 1 && num <= 5) status = "pending";
  else if (num >= 6 && num <= 7) status = "in_progress";
  else if (num >= 8 && num <= 10) status = "done";
  else status = "unknown";
  const titles: Record<string, string> = { pending: "未开始", in_progress: "进行中", done: "已完成" };
  return {
    ok: true,
    payload: { id, status, title: `${id} - ${titles[status]}`, description: `这是 ${id} 的详细描述（mock 数据）。` },
    latencyMs,
  };
}

export function estimateTokensAfter(prevTokens: number, toolResult: unknown): number {
  return prevTokens + 120 + JSON.stringify(toolResult ?? {}).length;
}