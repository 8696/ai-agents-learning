/**
 * 职责：本步核心 —— Agent 循环（while：想 → 做 → 看）+ 五道闸门。
 *   闸门 1 · 最大步数（max iterations）：按 step 计数
 *   闸门 2 · 超时（wall-clock timeout）：按毫秒
 *   闸门 3 · 模型说停（model_says_stop）：看 finish_reason=stop
 *   闸门 4 · 用户取消（user_cancel）：看 abortSignal.aborted
 *   闸门 5 · 工具重试上限（tool_retry_cap）：单次工具失败按指数退避重试 N 次
 * 数据流：入参 RunLoopInput → 出参 RunLoopOutput（trajectory / stepCount / 闸门触发信息）。
 * 为什么单独成文件：本条教学点是「五闸门叠加」；打开这一个文件就能把整个 while + 五道闸读完。
 *
 * step-5 相对 step-4 的增量（§5.3.14 增量构建）：
 *   - 新增 enableToolRetryGate / toolMaxRetries / flakyRate / alwaysFail 四个参数
 *   - 新增 StoppedReason = "tool_retry_cap"
 *   - 工具调用抽到 lib/flow/loop-step.ts：单步主路径（调工具 + 闸门 5 判定）
 *   - 工具重试抽到 lib/flow/tool-retry.ts：单次工具失败按指数退避重试
 *
 * §5.3.0 默认调真模型。
 */
import OpenAI from "openai";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { callRealLlmStep, SYSTEM_PROMPT } from "./llm-call.js";
import { mockLlmStepContinue, mockLlmStepStop } from "./loop-helpers.js";
import { runOneStep } from "./loop-step.js";
import type { RunLoopInput, RunLoopOutput } from "./loop-types.js";

// 重新导出 type（routes/*.ts 仍 import 自这里）
export type { RunLoopInput, RunLoopOutput } from "./loop-types.js";

export async function runLoop(input: RunLoopInput): Promise<RunLoopOutput> {
  const { enableMaxStepsGate, enableTimeoutGate, enableModelStopGate, enableUserCancelGate, enableToolRetryGate, enableToolCallLoopGate, enableTokenBudgetGate, useRealLlm, hardCap, label, abortSignal } = input;
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
    "为什么写这条日志：七闸门演示根函数；当前：label=" + label + " · useRealLlm=" + useRealLlm + " · max=" + (enableMaxStepsGate ? input.maxSteps : "off") + " · timeout=" + (enableTimeoutGate ? input.timeoutMs + "ms" : "off") + " · model_stop=" + (enableModelStopGate ? "on" : "off") + " · user_cancel=" + (enableUserCancelGate ? "on" : "off") + " · tool_retry=" + (enableToolRetryGate ? input.toolMaxRetries + "次" : "off") + " · tool_loop=" + (enableToolCallLoopGate ? "连续" + input.loopDetectionWindow + "次" : "off") + " · token_budget=" + (enableTokenBudgetGate ? input.tokenBudget + "tokens" : "off") + " · flakyRate=" + input.flakyRate + " · alwaysFail=" + input.alwaysFail,
    { 入参: input, __code: "const out = await runLoop(input);" },
  );

  // 共享状态（被 while + runOneStep 改）
  const state = {
    stepCount: 0,
    toolCallCount: 0,
    toolFailureCount: 0,
    toolRetrySuccessCount: 0,
    recentToolCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    tokenEstimate: 0,
    stoppedReason: "never_stopped" as RunLoopOutput["stoppedReason"],
    gateTriggered: null as string | null,
    lastToolArg: null as string | null,
    finalAnswer: null as string | null,
    toolUnavailable: false,
    loopDetected: false,
    trajectory: [] as RunLoopOutput["trajectory"],
    useRealLlm,
  };

  while (state.stepCount < effectiveMax) {
    // 闸门 4 · 用户取消
    if (enableUserCancelGate && abortSignal?.aborted) {
      state.stoppedReason = "user_cancel";
      state.gateTriggered = `用户取消（${abortSignal.reason || "客户端断开 / 取消按钮"}）`;
      break;
    }
    // 闸门 2 · 超时
    const elapsedNow = Date.now() - t0;
    if (elapsedNow >= effectiveTimeoutMs) {
      state.stoppedReason = "timeout";
      state.gateTriggered = `达到超时上限（${input.timeoutMs}ms · 实际 ${elapsedNow}ms）`;
      break;
    }

    // ① Reason：问模型（mock 或真模型）
    let decision: Awaited<ReturnType<typeof callRealLlmStep>>;
    if (useRealLlm && openai) {
      decision = await callRealLlmStep(openai, modelId, messages);
    } else if (enableModelStopGate && state.stepCount >= input.mockStopAt) {
      decision = { ...mockLlmStepStop(state.stepCount), toolCallId: null };
    } else {
      decision = { ...mockLlmStepContinue(state.stepCount), toolCallId: null };
    }

    // 闸门 3 · 模型说停
    if (enableModelStopGate && decision.finishReason === "stop" && !decision.toolCall) {
      state.stoppedReason = "model_says_stop";
      state.finalAnswer = decision.content || "（模型没返回 final_answer 字段）";
      state.gateTriggered = `模型主动停（finishReason=${decision.finishReason} · final_answer=${state.finalAnswer?.slice(0, 80)}）`;
      break;
    }

    // 闸门 6 · 同工具循环检测（在调工具前看最近 N 步）
    if (enableToolCallLoopGate && decision.toolCall) {
      const recentWindow = input.loopDetectionWindow - 1; // 当前这一步是第 N 个
      if (state.recentToolCalls.length >= recentWindow) {
        const lastN = state.recentToolCalls.slice(-recentWindow);
        const allSame = lastN.every(c => c.name === decision.toolCall!.name && JSON.stringify(c.args) === JSON.stringify(decision.toolCall!.args));
        if (allSame) {
          state.stoppedReason = "tool_call_loop";
          state.loopDetected = true;
          state.gateTriggered = `工具 ${decision.toolCall.name} 连续 ${input.loopDetectionWindow} 次同参数调用 · 死循环信号`;
          logger.warn(
            "调用函数-runLoop",
            "调用函数：runLoop 提前结束（tool_call_loop）",
            "为什么写这条日志：闸门 6 兜底——同工具同参数连续 N 次 = 死循环信号。当前：tool=" + decision.toolCall.name + " · window=" + input.loopDetectionWindow,
            { toolName: decision.toolCall.name, args: decision.toolCall.args, window: input.loopDetectionWindow, recent: state.recentToolCalls },
          );
          break;
        }
      }
    }

    // 闸门 7 · token budget：在累完 token 后看是否超预算
    if (enableTokenBudgetGate && state.tokenEstimate > input.tokenBudget) {
      state.stoppedReason = "token_budget";
      state.gateTriggered = `token 累计 ${state.tokenEstimate} 超过预算 ${input.tokenBudget}`;
      logger.warn(
        "调用函数-runLoop",
        "调用函数：runLoop 提前结束（token_budget）",
        "为什么写这条日志：闸门 7 兜底——token 烧到上限了，账单要停。当前：累计 token=" + state.tokenEstimate + " · 预算=" + input.tokenBudget,
        { totalTokens: state.tokenEstimate, tokenBudget: input.tokenBudget },
      );
      break;
    }

    // ② Act + ③ Observe + 闸门 5
    state.stepCount += 1;
    const continueLoop = await runOneStep({
      decision,
      stepIndex: state.stepCount,
      input,
      state,
      t0,
      pushMessages: (assistant, tool) => {
        messages.push(assistant as OpenAI.Chat.Completions.ChatCompletionMessageParam, tool as OpenAI.Chat.Completions.ChatCompletionMessageParam);
      },
    });
    // 把当前这一步的工具调用记到 recent
    if (decision.toolCall) {
      state.recentToolCalls.push({ name: decision.toolCall.name, args: decision.toolCall.args });
    }
    if (!continueLoop) break;

    // 闸门 1 · 最大步数
    if (enableMaxStepsGate && state.stepCount >= input.maxSteps) {
      state.stoppedReason = "max_steps";
      state.gateTriggered = `达到最大迭代次数（${input.maxSteps} 步）`;
      break;
    }
    // 全关闸的人为硬上限
    if (!enableMaxStepsGate && !enableTimeoutGate && !enableModelStopGate && !enableUserCancelGate && !enableToolRetryGate && !enableToolCallLoopGate && !enableTokenBudgetGate && state.stepCount >= hardCap) {
      state.stoppedReason = "never_stopped";
      state.gateTriggered = `达到硬上限（${hardCap} 步，演示闸门缺失）`;
      break;
    }
  }

  const elapsedMs = Date.now() - t0;
  const out: RunLoopOutput = {
    label,
    enableMaxStepsGate,
    enableTimeoutGate,
    enableModelStopGate,
    enableUserCancelGate,
    enableToolRetryGate,
    useRealLlm,
    configuredMaxSteps: input.maxSteps,
    configuredTimeoutMs: input.timeoutMs,
    stepCount: state.stepCount,
    toolCallCount: state.toolCallCount,
    toolFailureCount: state.toolFailureCount,
    toolRetrySuccessCount: state.toolRetrySuccessCount,
    stoppedReason: state.stoppedReason,
    gateTriggered: state.gateTriggered,
    tokenEstimate: state.tokenEstimate,
    trajectory: state.trajectory,
    summary: { elapsedMs, lastToolArg: state.lastToolArg, finalAnswer: state.finalAnswer, toolUnavailable: state.toolUnavailable, loopDetected: state.loopDetected, recentToolCalls: state.recentToolCalls },
  };
  logger.info(
    "调用函数-runLoop",
    "调用函数结束：runLoop",
    "为什么写这条日志：七闸门演示收口；前端要把 stoppedReason + stepCount + tokenEstimate + elapsedMs 四个数字亮出来，看谁先到。当前：stepCount=" + state.stepCount + " · stoppedReason=" + state.stoppedReason + " · elapsedMs=" + elapsedMs + " · token 累计=" + state.tokenEstimate,
    { 返回值: { label: out.label, stepCount: out.stepCount, stoppedReason: out.stoppedReason, gateTriggered: out.gateTriggered, tokenEstimate: out.tokenEstimate, elapsedMs: out.summary.elapsedMs, toolCallCount: out.toolCallCount, toolFailureCount: out.toolFailureCount, toolRetrySuccessCount: out.toolRetrySuccessCount, trajectoryLen: out.trajectory.length, finalAnswer: out.summary.finalAnswer?.slice(0, 120) }, 耗时ms: elapsedMs },
  );
  return out;
}