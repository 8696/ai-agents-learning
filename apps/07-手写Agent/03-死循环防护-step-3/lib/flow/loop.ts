/**
 * 职责：本步核心 —— Agent 循环 + 三道闸门（max iterations + timeout + model_says_stop）。
 * 数据流：入参 { enableMaxStepsGate, maxSteps, enableTimeoutGate, timeoutMs, enableModelStopGate, useRealLlm, query, latencyMsPerStep, hardCap, label } → 出参 { stepCount, stoppedReason, gateTriggered, elapsedMs, tokenEstimate, trajectory }。
 * 为什么单独成文件：本条教学点是「模型说停」+ 三闸叠加；打开这一个文件就能把整个 while + 三道闸读完。
 *
 * step-3 相对 step-2 的增量（§5.3.14 增量构建）：
 *   - 新增 enableModelStopGate：模型自己说停（finishReason="stop" 且无 tool_call）→ break
 *   - 新增 useRealLlm：model_stop / triple 闸需要真模型的 finish_reason；其它闸继续 mock
 *   - 新增 query：真模型任务输入
 *   - 新增 StoppedReason = "model_says_stop"
 *   - while 条件叠加：&& !decision.toolCall && finishReason!=="tool_calls"（模型说停信号）
 *
 * 闸门策略：谁先到谁说了算（max iterations / timeout / model_says_stop 任一触达都 break）。
 *
 * §5.3.0 默认调真模型：model_stop / triple 闸必须真调模型看 finish_reason；其它闸继续 mock（不变）。
 *
 * 真模型调用抽到 lib/flow/llm-call.ts（拆出来控 loop.ts 行数 ≤280）。
 */
import OpenAI from "openai";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { callRealLlmStep, SYSTEM_PROMPT } from "./llm-call.js";

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
  enableMaxStepsGate: boolean;
  maxSteps: number;
  enableTimeoutGate: boolean;
  timeoutMs: number;
  enableModelStopGate: boolean;
  useRealLlm: boolean;
  query: string;
  mockStopAt: number;
  latencyMsPerStep: number;
  hardCap: number;
  label: string;
}

export interface RunLoopOutput {
  label: string;
  enableMaxStepsGate: boolean;
  enableTimeoutGate: boolean;
  enableModelStopGate: boolean;
  useRealLlm: boolean;
  configuredMaxSteps: number;
  configuredTimeoutMs: number;
  stepCount: number;
  stoppedReason: StoppedReason;
  gateTriggered: string | null;
  tokenEstimate: number;
  trajectory: Array<{
    stepIndex: number;
    decision: { finishReason: string; thought: string; toolCall: { name: string; args: Record<string, unknown> } | null };
    toolCall: { name: string; args: Record<string, unknown> } | null;
    toolResult: { ok: boolean; available?: number; latencyMs: number; error?: string } | null;
    tokenAfter: number;
    wallClockMs: number;
    realLlm: boolean;
  }>;
  summary: { elapsedMs: number; lastSku: string | null; finalAnswer: string | null };
}

// ── mock 模型（step-1/2 已用过；step-3 加 stop 版） ──
function mockLlmStepContinue(stepIndex: number) {
  const sku = `SKU-${String(stepIndex + 1).padStart(3, "0")}`;
  return {
    finishReason: "tool_calls",
    thought: `第 ${stepIndex + 1} 轮：模型决定查 ${sku}。`,
    toolCall: { name: "queryStock", args: { sku } },
    content: null,
  };
}

function mockLlmStepStop(stepIndex: number) {
  return {
    finishReason: "stop",
    thought: `第 ${stepIndex + 1} 轮：模型决定结束（mock stop）。`,
    toolCall: null,
    content: "final_answer: mock 模型演示结束任务",
  };
}

// ── mock 工具：查库存 ──
async function mockToolQueryStock(sku: string, latencyMs: number) {
  if (latencyMs > 0) await new Promise(r => setTimeout(r, latencyMs));
  const available = Math.abs((sku.charCodeAt(4) * 31 + parseInt(sku.slice(4), 10) * 7) % 100);
  return { ok: true, available, latencyMs };
}

function estimateTokensAfter(prevTokens: number, toolResult: unknown): number {
  return prevTokens + 120 + JSON.stringify(toolResult ?? {}).length;
}

/**
 * 本步核心：Agent 循环 + 三道闸门（max iterations + timeout + model_says_stop）。
 *
 * while 条件 =「还没达到任一闸门上限」+「模型还没主动停」。
 * 三道闸谁先到谁说了算；model_says_stop 单独不可靠，必须叠硬闸。
 */
export async function runLoop(input: RunLoopInput): Promise<RunLoopOutput> {
  const { enableMaxStepsGate, enableTimeoutGate, enableModelStopGate, useRealLlm, hardCap, label } = input;
  const effectiveMax = enableMaxStepsGate ? input.maxSteps : hardCap;
  const effectiveTimeoutMs = enableTimeoutGate ? input.timeoutMs : Number.MAX_SAFE_INTEGER;

  // 真模型客户端（仅 useRealLlm=true 时拿）
  let openai: OpenAI | null = null;
  let modelId = "";
  if (useRealLlm) {
    const llm = getLlm();
    openai = llm.openai;
    modelId = llm.modelA;
  }
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = useRealLlm
    ? [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input.query || "查 SKU-001 / SKU-002 / SKU-003 的库存，完成后输出 final_answer" },
      ]
    : [];

  const t0 = Date.now();
  logger.info(
    "调用函数-runLoop",
    "调用函数开始：runLoop",
    "为什么写这条日志：三闸门演示根函数；当前：label=" + label + " · useRealLlm=" + useRealLlm + " · max=" + (enableMaxStepsGate ? input.maxSteps : "off") + " · timeout=" + (enableTimeoutGate ? input.timeoutMs + "ms" : "off") + " · model_stop=" + (enableModelStopGate ? "on" : "off"),
    { 入参: input, __code: "const out = await runLoop(input);" },
  );

  const trajectory: RunLoopOutput["trajectory"] = [];
  let stepCount = 0;
  let tokenEstimate = 0;
  let stoppedReason: StoppedReason = "never_stopped";
  let gateTriggered: string | null = null;
  let lastSku: string | null = null;
  let finalAnswer: string | null = null;

  while (stepCount < effectiveMax) {
    const elapsedNow = Date.now() - t0;
    if (elapsedNow >= effectiveTimeoutMs) {
      stoppedReason = "timeout";
      gateTriggered = `达到 timeout（${input.timeoutMs}ms · 实际 ${elapsedNow}ms）`;
      break;
    }

    // ① Reason：问模型（mock 或真模型）
    let decision: { finishReason: string; thought: string; toolCall: { name: string; args: Record<string, unknown> } | null; content: string | null; toolCallId: string | null };
    if (useRealLlm && openai) {
      decision = await callRealLlmStep(openai, modelId, messages);
    } else if (enableModelStopGate && stepCount >= input.mockStopAt) {
      decision = { ...mockLlmStepStop(stepCount), toolCallId: null };
    } else {
      decision = { ...mockLlmStepContinue(stepCount), toolCallId: null };
    }

    // 闸门 3 · 模型说停：finishReason=stop + 无 toolCall → break
    if (enableModelStopGate && decision.finishReason === "stop" && !decision.toolCall) {
      stoppedReason = "model_says_stop";
      finalAnswer = decision.content || "（模型没返回 final_answer 字段）";
      gateTriggered = `模型主动停（finishReason=${decision.finishReason} · final_answer=${finalAnswer?.slice(0, 80)}）`;
      break;
    }

    // ② Act：调工具（mock）
    const toolCall = decision.toolCall;
    let toolResult: { ok: boolean; available?: number; latencyMs: number; error?: string } | null = null;
    if (toolCall) {
      try {
        const r = await mockToolQueryStock(toolCall.args.sku as string, input.latencyMsPerStep);
        toolResult = { ok: r.ok, available: r.available, latencyMs: r.latencyMs };
        lastSku = toolCall.args.sku as string;
        if (useRealLlm) {
          messages.push({
            role: "assistant",
            content: decision.content,
            tool_calls: decision.toolCallId
              ? [{ id: decision.toolCallId, type: "function", function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) } }]
              : undefined,
          });
          messages.push({
            role: "tool",
            tool_call_id: decision.toolCallId ?? `call_${stepCount}`,
            content: JSON.stringify(toolResult),
          });
        }
      } catch (e: unknown) {
        toolResult = { ok: false, latencyMs: 0, error: String((e as Error)?.message ?? e) };
      }
    }

    // ③ Observe：累计 token
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
      realLlm: useRealLlm && Boolean(openai),
    });

    // 闸门判定
    if (enableMaxStepsGate && stepCount >= input.maxSteps) {
      stoppedReason = "max_steps";
      gateTriggered = `达到 max iterations（${input.maxSteps} 步）`;
      break;
    }
    if (!enableMaxStepsGate && !enableTimeoutGate && !enableModelStopGate && stepCount >= hardCap) {
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
    enableModelStopGate,
    useRealLlm,
    configuredMaxSteps: input.maxSteps,
    configuredTimeoutMs: input.timeoutMs,
    stepCount,
    stoppedReason,
    gateTriggered,
    tokenEstimate,
    trajectory,
    summary: { elapsedMs, lastSku, finalAnswer },
  };
  logger.info(
    "调用函数-runLoop",
    "调用函数结束：runLoop",
    "为什么写这条日志：三闸门演示收口；前端要把 stoppedReason + stepCount + tokenEstimate + elapsedMs 四个数字亮出来，看谁先到。当前：stepCount=" + stepCount + " · stoppedReason=" + stoppedReason + " · elapsedMs=" + elapsedMs,
    { 返回值: { label, stepCount, stoppedReason, gateTriggered, tokenEstimate, elapsedMs, trajectoryLen: trajectory.length, finalAnswer: finalAnswer?.slice(0, 120) }, 耗时ms: elapsedMs },
  );
  return out;
}