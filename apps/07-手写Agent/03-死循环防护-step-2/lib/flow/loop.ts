/**
 * 职责：本步核心 —— Agent 循环（while：想 → 做 → 看）+ 多道闸门（max iterations + timeout 叠加）。
 * 数据流：入参 { enableMaxStepsGate, maxSteps, enableTimeoutGate, timeoutMs, latencyMsPerStep, hardCap, label } → 出参 { stepCount, stoppedReason, gateTriggered, elapsedMs, tokenEstimate, trajectory }。
 * 为什么单独成文件：本条教学点是「多道闸门叠加」；打开这一个文件就能把整个 while + 两道闸读完。
 *
 * step-2 相对 step-1 的增量（§5.3.14 增量构建）：
 *   - 新增 enableTimeoutGate + timeoutMs + latencyMsPerStep 三个参数
 *   - 新增 StoppedReason = "timeout"
 *   - while 条件叠加：stepCount < effectiveMax && (Date.now() - t0) < effectiveTimeout
 *   - 每轮 sleep latencyMsPerStep 让 timeout 闸能真触发（演示效果）
 *   - 闸门判定：先到的闸门先 break
 *
 * 不调真 LLM（§5.3.0 例外）：mock 模型返回「再查一次」+ mock 工具返回伪库存数据。
 */
import { logger } from "../logger.js";

export type StoppedReason =
  | "never_stopped"
  | "max_steps"
  | "timeout"
  | "model_says_stop"
  | "user_cancel"
  | "tool_retry_cap"
  | "tool_call_loop"
  | "token_budget";

export interface RunLoopInput {
  /** 是否启用 max iterations 闸门 */
  enableMaxStepsGate: boolean;
  /** 闸门上限（仅当 enableMaxStepsGate=true 时生效） */
  maxSteps: number;
  /** 是否启用 timeout 闸门（step-2 新增） */
  enableTimeoutGate: boolean;
  /** timeout 上限（仅当 enableTimeoutGate=true 时生效）单位 ms */
  timeoutMs: number;
  /** mock 工具每轮延时（让 timeout 闸能真触发；step-2 新增） */
  latencyMsPerStep: number;
  /** 人为硬上限（避免反例真卡死浏览器） */
  hardCap: number;
  /** 本轮跑动名（用于 trace 标题） */
  label: string;
}

export interface RunLoopOutput {
  label: string;
  enableMaxStepsGate: boolean;
  enableTimeoutGate: boolean;
  configuredMaxSteps: number;
  configuredTimeoutMs: number;
  stepCount: number;
  stoppedReason: StoppedReason;
  gateTriggered: string | null;
  tokenEstimate: number;
  /** 每一步的快照 */
  trajectory: Array<{
    stepIndex: number;
    decision: { finishReason: string; toolCall: { name: string; args: Record<string, unknown> } | null; thought: string };
    toolCall: { name: string; args: Record<string, unknown> } | null;
    toolResult: { ok: boolean; available?: number; latencyMs: number; error?: string } | null;
    tokenAfter: number;
    wallClockMs: number;
  }>;
  summary: { elapsedMs: number; lastSku: string | null };
}

// ── mock 模型（每轮都「再查一次」） ──
function mockLlmStep(stepIndex: number) {
  const sku = `SKU-${String(stepIndex + 1).padStart(3, "0")}`;
  return {
    finishReason: "tool_calls",
    thought: `第 ${stepIndex + 1} 轮：模型看了一下历史，决定查 ${sku} 的库存。`,
    toolCall: { name: "queryStock", args: { sku } },
  };
}

// ── mock 工具：查库存（step-2 加 sleep 模拟工具耗时） ──
async function mockToolQueryStock(sku: string, latencyMs: number) {
  if (latencyMs > 0) await new Promise(r => setTimeout(r, latencyMs));
  const available = Math.abs((sku.charCodeAt(4) * 31 + parseInt(sku.slice(4), 10) * 7) % 100);
  return { ok: true, available, latencyMs };
}

// ── 每轮成本估算（mock：每轮 system+user ≈ 120 tokens + tool result ≈ 40） ──
function estimateTokensAfter(prevTokens: number, toolResult: unknown): number {
  return prevTokens + 120 + JSON.stringify(toolResult ?? {}).length;
}

/**
 * 本步核心：Agent 循环 + 多道闸门（max iterations + timeout）。
 *
 * while 条件 =「还没达到任一闸门上限」—— stepCount 限 + 墙钟限任一触达都 break。
 *
 * 教学点：双闸叠加时**谁先到谁说了算**；不冲突（max iterations 看不到时间，timeout 看不到轮次）。
 */
export async function runLoop(input: RunLoopInput): Promise<RunLoopOutput> {
  const { enableMaxStepsGate, enableTimeoutGate, hardCap, label } = input;
  const effectiveMax = enableMaxStepsGate ? input.maxSteps : hardCap;
  const effectiveTimeoutMs = enableTimeoutGate ? input.timeoutMs : Number.MAX_SAFE_INTEGER;

  const t0 = Date.now();
  logger.info(
    "调用函数-runLoop",
    "调用函数开始：runLoop",
    "为什么写这条日志：闸门演示根函数；进来跑循环，看哪道闸先触。当前：label=" + label + " · max_steps=" + (enableMaxStepsGate ? input.maxSteps : "off") + " · timeout=" + (enableTimeoutGate ? input.timeoutMs + "ms" : "off") + " · latency/step=" + input.latencyMsPerStep + "ms",
    { 入参: input, __code: "const out = await runLoop(input);" },
  );

  const trajectory: RunLoopOutput["trajectory"] = [];
  let stepCount = 0;
  let tokenEstimate = 0;
  let stoppedReason: StoppedReason = "never_stopped";
  let gateTriggered: string | null = null;
  let lastSku: string | null = null;

  // ── while 条件 = 还没达到任一闸门上限 ──
  while (stepCount < effectiveMax) {
    const elapsedNow = Date.now() - t0;
    if (elapsedNow >= effectiveTimeoutMs) {
      stoppedReason = "timeout";
      gateTriggered = `达到 timeout（${input.timeoutMs}ms · 实际 ${elapsedNow}ms）`;
      break;
    }

    // ① Reason：问模型（mock）
    const decision = mockLlmStep(stepCount);
    lastSku = decision.toolCall!.args.sku as string;

    // ② Act：调工具（mock；可能 sleep 模拟耗时）
    const toolCall = decision.toolCall;
    let toolResult: { ok: boolean; available?: number; latencyMs: number; error?: string } | null = null;
    if (toolCall) {
      try {
        const r = await mockToolQueryStock(toolCall.args.sku as string, input.latencyMsPerStep);
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
      wallClockMs: Date.now() - t0,
    });

    // 闸门判定（在 step 末尾）—— 下一轮 while 会再判一次
    if (enableMaxStepsGate && stepCount >= input.maxSteps) {
      stoppedReason = "max_steps";
      gateTriggered = `达到 max iterations（${input.maxSteps} 步）`;
      break;
    }
    if (!enableMaxStepsGate && !enableTimeoutGate && stepCount >= hardCap) {
      stoppedReason = "never_stopped";
      gateTriggered = `达到硬上限（${hardCap} 步，演示闸门缺失）`;
      break;
    }
  }

  const elapsedMs = Date.now() - t0;
  const out: RunLoopOutput = {
    label,
    enableMaxStepsGate,
    enableTimeoutGate,
    configuredMaxSteps: input.maxSteps,
    configuredTimeoutMs: input.timeoutMs,
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
    "为什么写这条日志：闸门演示收口；前端要把 stoppedReason + stepCount + tokenEstimate + elapsedMs 四个数字亮出来，看谁先到。当前：stepCount=" + stepCount + " · stoppedReason=" + stoppedReason + " · elapsedMs=" + elapsedMs,
    { 返回值: { label, stepCount, stoppedReason, gateTriggered, tokenEstimate, elapsedMs, trajectoryLen: trajectory.length }, 耗时ms: elapsedMs },
  );
  return out;
}