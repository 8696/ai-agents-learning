/**
 * 职责：runLoop 的类型定义集中点。
 * 数据流：被 loop.ts / loop-step.ts 同时引用。
 * 为什么单独成文件：避免 loop.ts 单文件类型定义膨胀（被循环引用）。
 */
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
  enableUserCancelGate: boolean;
  enableToolRetryGate: boolean;
  /** step-6 新增：是否启用同工具循环检测闸 */
  enableToolCallLoopGate: boolean;
  /** step-6 新增：连续 N 次同工具同参数视为循环（默认 3） */
  loopDetectionWindow: number;
  useRealLlm: boolean;
  query: string;
  mockStopAt: number;
  latencyMsPerStep: number;
  hardCap: number;
  label: string;
  abortSignal: AbortSignal | null;
  toolMaxRetries: number;
  flakyRate: number;
  alwaysFail: boolean;
}

export interface RunLoopOutput {
  label: string;
  enableMaxStepsGate: boolean;
  enableTimeoutGate: boolean;
  enableModelStopGate: boolean;
  enableUserCancelGate: boolean;
  enableToolRetryGate: boolean;
  useRealLlm: boolean;
  configuredMaxSteps: number;
  configuredTimeoutMs: number;
  stepCount: number;
  toolCallCount: number;
  toolFailureCount: number;
  toolRetrySuccessCount: number;
  stoppedReason: StoppedReason;
  gateTriggered: string | null;
  tokenEstimate: number;
  trajectory: Array<{
    stepIndex: number;
    decision: { finishReason: string; thought: string; toolCall: { name: string; args: Record<string, unknown> } | null };
    toolCall: { name: string; args: Record<string, unknown> } | null;
    toolResult: { ok: boolean; available?: number; latencyMs: number; error?: string; attempt: number; failedAttempts: number } | null;
    tokenAfter: number;
    wallClockMs: number;
    realLlm: boolean;
  }>;
  summary: { elapsedMs: number; lastSku: string | null; finalAnswer: string | null; toolUnavailable: boolean; loopDetected: boolean; recentToolCalls: Array<{ name: string; args: Record<string, unknown> }> };
}