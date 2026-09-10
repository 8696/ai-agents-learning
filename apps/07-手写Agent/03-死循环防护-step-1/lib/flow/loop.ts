/**
 * 职责：本步核心 —— Agent 循环（while：想 → 做 → 看）+ 闸门（gate）。
 * 数据流：入参 { maxSteps, enableMaxStepsGate, label } → 出参 { trajectory, stoppedReason, stepCount, tokenEstimate, gateTriggered }
 * 为什么单独成文件：本条教学点是「循环 + 闸门」；打开这一个文件就能把整个 while 读完。
 *
 * 本条 step-1 只演示「变体 1 · max iterations」一道闸 + 一份反例（不装闸）。
 * 反例：硬跑到 HARD_CAP=200 步人为截停（避免真卡死浏览器）；不停 = 烧光账单的隐喻。
 * 闸门：max iterations（MAX_STEPS=10）—— 第 10 步结束 break；stoppedReason = "max_steps"。
 *
 * 不调真 LLM（§5.3.0 例外）：mock 模型返回「再查一次」+ mock 工具返回伪库存数据。
 */
import { logger } from "../logger.js";

export type StoppedReason =
  | "never_stopped"
  | "max_steps"
  | "model_says_stop"
  | "user_cancel"
  | "tool_retry_cap"
  | "tool_call_loop"
  | "token_budget";

export interface RunLoopInput {
  /** 是否启用 max iterations 闸门。false = 反例（不装闸） */
  enableMaxStepsGate: boolean;
  /** 闸门上限（仅当 enableMaxStepsGate=true 时生效） */
  maxSteps: number;
  /** 人为硬上限（避免反例真卡死浏览器；演示「如果没闸会一直涨」） */
  hardCap: number;
  /** 给本轮跑动起个名字（用于 trace 标题） */
  label: string;
}

export interface RunLoopOutput {
  label: string;
  enableMaxStepsGate: boolean;
  configuredMaxSteps: number;
  stepCount: number;
  stoppedReason: StoppedReason;
  gateTriggered: string | null;
  tokenEstimate: number;
  /** 每一步的快照：stepIndex / decision / toolCall / toolResult / tokenAfter */
  trajectory: Array<{
    stepIndex: number;
    decision: { finishReason: string; toolCall: { name: string; args: Record<string, unknown> } | null; thought: string };
    toolCall: { name: string; args: Record<string, unknown> } | null;
    toolResult: { ok: boolean; available?: number; latencyMs: number; error?: string } | null;
    tokenAfter: number;
  }>;
  summary: { elapsedMs: number; lastSku: string | null };
}

// ── mock 模型（每轮都「再查一次」）──
function mockLlmStep(stepIndex: number) {
  // 这一步的 Reason：决定调哪个工具、传什么参数
  const sku = `SKU-${String(stepIndex + 1).padStart(3, "0")}`;
  return {
    finishReason: "tool_calls",
    thought: `第 ${stepIndex + 1} 轮：模型看了一下历史，决定查 ${sku} 的库存。`,
    toolCall: { name: "queryStock", args: { sku } },
  };
}

// ── mock 工具：查库存（返回伪数据；故意让结果每次不同，方便看 stepCount 涨） ──
function mockToolQueryStock(sku: string) {
  // 伪库存：固定哈希 + 步数扰动 → 不会太规律
  const available = Math.abs((sku.charCodeAt(4) * 31 + parseInt(sku.slice(4), 10) * 7) % 100);
  return { ok: true, available, latencyMs: 1 };
}

// ── 每轮成本估算（mock：每轮 system+user ≈ 120 tokens + tool result ≈ 40） ──
function estimateTokensAfter(prevTokens: number, toolResult: unknown): number {
  return prevTokens + 120 + JSON.stringify(toolResult ?? {}).length;
}

/**
 * 本步核心：Agent 循环 + max iterations 闸门。
 *
 * while 条件 =「还没达到闸门上限」。step-1 只挂这一道闸；step-2 之后再叠加 timeout / model_stop / user_cancel。
 *
 * 教学点：把「没闸」和「有闸」两次跑出来的 stepCount / tokenEstimate 对比 —— 一眼看见「不装闸会怎样」。
 */
export async function runLoop(input: RunLoopInput): Promise<RunLoopOutput> {
  const { enableMaxStepsGate, hardCap, label } = input;
  const effectiveMax = enableMaxStepsGate ? input.maxSteps : hardCap;

  const t0 = Date.now();
  logger.info(
    "调用函数-runLoop",
    "调用函数开始：runLoop",
    "为什么写这条日志：闸门演示的根函数；进来跑循环，每一步累积 token，看哪道闸先触。当前：label=" + label + " · gate=" + (enableMaxStepsGate ? "max_steps=" + effectiveMax : "无闸（硬上限=" + effectiveMax + "）"),
    { 入参: input, __code: "const out = await runLoop(input);" },
  );

  const trajectory: RunLoopOutput["trajectory"] = [];
  let stepCount = 0;
  let tokenEstimate = 0;
  let stoppedReason: StoppedReason = "never_stopped";
  let gateTriggered: string | null = null;
  let lastSku: string | null = null;

  // ── while 条件 = 还没达到闸门上限 ──
  while (stepCount < effectiveMax) {
    // ① Reason：问模型（mock）
    const decision = mockLlmStep(stepCount);
    lastSku = decision.toolCall!.args.sku as string;

    // ② Act：调工具（mock）
    const toolCall = decision.toolCall;
    let toolResult: { ok: boolean; available?: number; latencyMs: number; error?: string } | null = null;
    if (toolCall) {
      try {
        const r = mockToolQueryStock(toolCall.args.sku as string);
        toolResult = { ok: r.ok, available: r.available, latencyMs: r.latencyMs };
      } catch (e: unknown) {
        toolResult = { ok: false, latencyMs: 0, error: String((e as Error)?.message ?? e) };
      }
    }

    // ③ Observe：把结果塞回消息；累计 token
    tokenEstimate = estimateTokensAfter(tokenEstimate, toolResult);
    stepCount += 1;
    trajectory.push({
      stepIndex: stepCount,
      decision: {
        finishReason: decision.finishReason,
        thought: decision.thought,
        toolCall: decision.toolCall,
      },
      toolCall,
      toolResult,
      tokenAfter: tokenEstimate,
    });

    // 闸门判定（在 step 末尾）—— 下一轮 while 会再判一次
    if (enableMaxStepsGate && stepCount >= input.maxSteps) {
      stoppedReason = "max_steps";
      gateTriggered = `达到 max iterations（${input.maxSteps} 步）`;
      break;
    }
    if (!enableMaxStepsGate && stepCount >= hardCap) {
      stoppedReason = "never_stopped";
      gateTriggered = `达到硬上限（${hardCap} 步，演示闸门缺失）`;
      break;
    }
  }

  const elapsedMs = Date.now() - t0;
  const out: RunLoopOutput = {
    label,
    enableMaxStepsGate,
    configuredMaxSteps: input.maxSteps,
    stepCount,
    stoppedReason,
    gateTriggered,
    tokenEstimate,
    trajectory,
    summary: { elapsedMs, lastSku },
  };
  logger.info(
    "调用函数-runLoop",
    "调用函数结束：runLoop",
    "为什么写这条日志：闸门演示的收口；前端要把 stoppedReason + stepCount + tokenEstimate 三个数字亮出来。当前：stepCount=" + stepCount + " · stoppedReason=" + stoppedReason,
    { 返回值: { label, stepCount, stoppedReason, gateTriggered, tokenEstimate, trajectoryLen: trajectory.length, elapsedMs }, 耗时ms: elapsedMs },
  );
  return out;
}