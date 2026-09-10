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

export async function mockToolQueryStock(
  sku: string,
  latencyMs: number,
  flakyRate: number,
  alwaysFail: boolean,
  attempt: number,
): Promise<{ ok: boolean; available?: number; latencyMs: number; error?: string }> {
  if (latencyMs > 0) await new Promise(r => setTimeout(r, latencyMs));
  const roll = Math.random();
  const fail = alwaysFail || roll < flakyRate;
  if (fail) {
    return { ok: false, latencyMs, error: `mock 工具模拟失败（attempt=${attempt}，roll=${roll.toFixed(2)}，flakyRate=${flakyRate}，alwaysFail=${alwaysFail}）` };
  }
  const available = Math.abs((sku.charCodeAt(4) * 31 + parseInt(sku.slice(4), 10) * 7 + attempt) % 100);
  return { ok: true, available, latencyMs };
}

export function estimateTokensAfter(prevTokens: number, toolResult: unknown): number {
  return prevTokens + 120 + JSON.stringify(toolResult ?? {}).length;
}