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

/** 实时进度：loop.ts 每步推一次；前端轮询时拿到，避免「running 阶段什么反应都没有」。 */
export interface RunProgress {
  /** 当前正在跑第几步（0 = 启动中；1+ = 第 N 步进行中或已结束） */
  currentStep: number;
  /** 累计 token 估算（同步自 state.tokenEstimate） */
  totalTokens: number;
  /** 累计调用模型次数（每步 1 次） */
  apiCalls: number;
  /** 最后动作描述（调模型 / 调工具 / 闸门触发） */
  lastAction: string;
}

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
  /** step-7 新增：是否启用 token 预算闸 */
  enableTokenBudgetGate: boolean;
  /** step-7 新增：token 累计上限（超了就 break） */
  tokenBudget: number;
  /** step-8 新增：每步调一次，把当前进度推给 routes/runs.ts；前端轮询时拿到。 */
  onProgress?: (progress: RunProgress) => void;
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
  summary: { elapsedMs: number; lastToolArg: string | null; finalAnswer: string | null; toolUnavailable: boolean; loopDetected: boolean; recentToolCalls: Array<{ name: string; args: Record<string, unknown> }> };
}