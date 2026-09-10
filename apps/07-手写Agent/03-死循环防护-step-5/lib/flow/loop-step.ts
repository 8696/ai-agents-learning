/**
 * 职责：单次循环的"问模型 → 调工具 → 累计 token"主流程（含闸门判定、trajectory push）。
 * 数据流：runLoopWhile 把 model 调出来 / 把 tool 调出来 / 维护 stepCount + tokenEstimate + trajectory，由本文件聚焦。
 * 为什么单独成文件：loop.ts 是入口（本步核心，文件头写「本步核心」），单步主路径放这里控行数。
 *
 * step-5 增量：闸门 5（tool_retry_cap）在本文件里 break；闸门 1/2/3/4 在 runLoop 里 break。
 */
import { logger } from "../logger.js";
import type { RunLoopInput, RunLoopOutput, StoppedReason } from "./loop-types.js";
import { mockToolQueryStock, estimateTokensAfter } from "./loop-helpers.js";
import { runWithRetry } from "./tool-retry.js";

interface StepState {
  stepCount: number;
  tokenEstimate: number;
  toolCallCount: number;
  toolFailureCount: number;
  toolRetrySuccessCount: number;
  lastSku: string | null;
  finalAnswer: string | null;
  toolUnavailable: boolean;
  stoppedReason: StoppedReason;
  gateTriggered: string | null;
  trajectory: RunLoopOutput["trajectory"];
  useRealLlm: boolean;
  /** 工具调用成功后再累 messages（真模型专用） */
  pushMessages: (assistant: unknown, tool: unknown) => void;
}

export interface StepDeps {
  /** 当前 step 决策（已经调过真模型或 mock） */
  decision: {
    finishReason: string;
    thought: string;
    toolCall: { name: string; args: Record<string, unknown> } | null;
    content: string | null;
    toolCallId: string | null;
  };
  /** 当前 step 的 stepCount（1-based） */
  stepIndex: number;
  input: RunLoopInput;
  state: StepState;
  t0: number;
  pushMessages: (assistant: unknown, tool: unknown) => void;
}

/** 单步主路径：调工具（含重试闸）→ 累 token → push trajectory；返 true 表示继续 while，false 表示已触发 break。 */
export async function runOneStep(deps: StepDeps): Promise<boolean> {
  const { decision, stepIndex, input, state, t0, pushMessages } = deps;
  const toolCall = decision.toolCall;
  let toolResult: {
    ok: boolean;
    available?: number;
    latencyMs: number;
    error?: string;
    attempt: number;
    failedAttempts: number;
  } | null = null;

  if (toolCall) {
    state.lastSku = toolCall.args.sku as string;
    state.toolCallCount += 1;
    const retryResult = await runWithRetry({
      tool: (attempt) => mockToolQueryStock(
        toolCall.args.sku as string,
        input.latencyMsPerStep,
        input.flakyRate,
        input.alwaysFail,
        attempt,
      ),
      maxRetries: input.enableToolRetryGate ? input.toolMaxRetries : 0,
      toolName: toolCall.name,
      toolArgs: toolCall.args,
    });
    state.toolFailureCount += retryResult.failedAttempts;
    if (retryResult.ok && retryResult.failedAttempts > 0) {
      state.toolRetrySuccessCount += 1;
    }
    if (retryResult.ok) {
      toolResult = retryResult;
    } else {
      if (input.enableToolRetryGate) {
        state.stoppedReason = "tool_retry_cap";
        state.toolUnavailable = true;
        state.gateTriggered = `工具 ${toolCall.name} 重试 ${input.toolMaxRetries} 次全失败 · 降级：告诉用户这条工具不可用`;
        toolResult = retryResult;
        logger.warn(
          "调用函数-runLoop",
          "调用函数：runLoop 提前结束（tool_retry_cap）",
          "为什么写这条日志：闸门 5 兜底——工具不可用时 Agent 不应继续 while 循环。当前：tool=" + toolCall.name + " · failedAttempts=" + input.toolMaxRetries,
          { sku: toolCall.args.sku, toolMaxRetries: input.toolMaxRetries, finalState: "tool_unavailable" },
        );
      } else {
        toolResult = { ok: false, latencyMs: 0, error: retryResult.error ?? "unknown", attempt: 1, failedAttempts: 1 };
      }
    }

    if (state.useRealLlm) {
      pushMessages(
        { role: "assistant", content: decision.content, tool_calls: decision.toolCallId ? [{ id: decision.toolCallId, type: "function", function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) } }] : undefined },
        { role: "tool", tool_call_id: decision.toolCallId ?? `call_${stepIndex}`, content: JSON.stringify(toolResult) },
      );
    }
  }

  state.tokenEstimate = estimateTokensAfter(state.tokenEstimate, toolResult);
  state.trajectory.push({
    stepIndex,
    decision: {
      finishReason: decision.finishReason,
      thought: decision.thought,
      toolCall: decision.toolCall,
    },
    toolCall,
    toolResult,
    tokenAfter: state.tokenEstimate,
    wallClockMs: Date.now() - t0,
    realLlm: state.useRealLlm,
  });

  if (state.stoppedReason === "tool_retry_cap") return false;
  return true;
}