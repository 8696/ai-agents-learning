/**
 * 职责：Orchestrator-Workers 三段流水线的类型 + 初始值常量。
 * 数据流：external 入 → initialOrchestratorState → OrchestratorState → OrchestratorOutput。
 */

export type OrchestratorState = {
  orderSlip: string;
  fanOutTasks: Array<{ drink: string }> | null;
  workerResults: Array<{ drink: string; available: boolean; note: string }> | null;
  guestReply: string | null;
};

export const initialOrchestratorState = (orderSlip: string): OrchestratorState => ({
  orderSlip,
  fanOutTasks: null,
  workerResults: null,
  guestReply: null,
});

export type WorkerTrace = {
  drink: string;
  available: boolean;
  note: string;
  reasoning: string;
  elapsedMs: number;
};

export type OrchestratorOutput = {
  state: OrchestratorState;
  stages: {
    orchestrator: { tasks: Array<{ drink: string }>; reasoning: string; elapsedMs: number };
    workers: WorkerTrace[];
    aggregator: { guestReply: string; reasoning: string; elapsedMs: number };
  };
  totalElapsedMs: number;
};
