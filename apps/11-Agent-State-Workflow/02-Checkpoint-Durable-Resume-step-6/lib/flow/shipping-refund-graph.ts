/**
 * 职责：业务例子图（变体 F 收口）—— 订单发货判断 + 退款，演示「同图同 runId」边界。
 * 节点：fetchOrder → checkShipment → noop → done / refund → done。
 * 状态字段：orderId、isShipped、action、completedNodes。
 * 跟 cafe-graph 不同的关键点：本步不调 writeCheckpoint，只在内存里跑——教学点是「同图同 runId」的判定，不是「走一步写检查点」。
 * 为什么单独成文件：业务例子图，跟咖啡店主图（cafe-graph）解耦，避免 NodeName 类型被混在一起。
 */
import { logger } from "../logger.js";

export const SR_NODE_IDS = [
  "fetchOrder",
  "checkShipment",
  "noop",
  "refund",
  "done",
] as const;
export type SRNodeName = (typeof SR_NODE_IDS)[number];

export const SR_NODE_LABELS: Record<SRNodeName, string> = {
  fetchOrder: "查订单（fetchOrder）",
  checkShipment: "看发货（checkShipment）",
  noop: "已发货不操作（noop）",
  refund: "没发货就退款（refund）",
  done: "完成（done）",
};

export const SR_EDGES: Record<SRNodeName, SRNodeName[]> = {
  fetchOrder: ["checkShipment"],
  checkShipment: ["noop", "refund"],
  noop: ["done"],
  refund: ["done"],
  done: [],
};

export interface SRState {
  currentNode: SRNodeName;
  orderId: string;
  isShipped: boolean;
  action: "" | "noop" | "refund";
  completedNodes: SRNodeName[];
}

export function createInitialSRState(orderId: string): SRState {
  return {
    currentNode: "fetchOrder",
    orderId: orderId.trim(),
    isShipped: false,
    action: "",
    completedNodes: [],
  };
}

export function fetchOrder(state: SRState): Partial<SRState> {
  return { orderId: state.orderId };
}

export function checkShipment(state: SRState): Partial<SRState> {
  // 模拟：订单号以 "shipped-" 开头的视为已发货；其余视为未发货
  const isShipped = state.orderId.startsWith("shipped-");
  return { isShipped };
}

export function noopFn(): Partial<SRState> {
  return { action: "noop" };
}

export function refundFn(): Partial<SRState> {
  return { action: "refund" };
}

export function doneFn(): Partial<SRState> {
  return {};
}

export function srRouteAfter(from: SRNodeName, state: SRState): SRNodeName {
  if (from === "fetchOrder") return "checkShipment";
  if (from === "checkShipment") return state.isShipped ? "noop" : "refund";
  if (from === "noop" || from === "refund") return "done";
  return "done";
}

export function isLegalSREdge(from: SRNodeName, to: SRNodeName): boolean {
  return SR_EDGES[from].includes(to);
}

export function isSRTerminal(node: SRNodeName): boolean {
  return node === "done";
}

export type SRNodeFn = (state: SRState) => Partial<SRState>;

export const SR_NODES: Record<SRNodeName, SRNodeFn> = {
  fetchOrder: (state) => fetchOrder(state),
  checkShipment: (state) => checkShipment(state),
  noop: () => noopFn(),
  refund: () => refundFn(),
  done: () => doneFn(),
};

function logCall<T>(
  scope: string,
  name: string,
  explainWhy: string,
  args: unknown,
  code: string,
  fieldGuide: Record<string, string>,
  run: () => T,
): T {
  const started = Date.now();
  logger.info(scope, `调用函数开始：${name}`, `为什么写这条日志：${explainWhy}。当前：刚进入 ${name}。`, {});
  logger.info(scope, `调用函数：${name}`, `为什么写这条日志：记下完整入参。当前：尚未执行函数体。`, { 入参: args });
  logger.info(scope, `调用函数：${name}`, `为什么写这条日志：对照函数体。当前：即将执行。`, { __code: code });
  try {
    const result = run();
    logger.info(scope, `调用函数结束：${name}`, `为什么写这条日志：这一调用结束。当前：即将返回调用方。`, {
      返回值: result,
      耗时ms: Date.now() - started,
      字段释义: fieldGuide,
    });
    return result;
  } catch (error: unknown) {
    logger.error(scope, `调用函数结束：${name}（失败）`, `为什么写这条日志：调用失败也要留下结束。当前：${name} 抛错。`, {
      返回值: error,
      耗时ms: Date.now() - started,
    });
    throw error;
  }
}

const runs = new Map<string, SRState>();

export function startSRRun(orderId: string): { runId: string; state: SRState } {
  return logCall(
    "开始业务例子任务运行",
    "startSRRun",
    "变体 F · 业务例子 · 同图同 runId：先在内存里建一件任务运行（不调存档器，本步不演示持久化）",
    { orderId },
    startSRRun.toString(),
    {
      runId: "新生成的任务运行编号",
      state: "初始状态，currentNode = fetchOrder",
    },
    () => {
      const state = createInitialSRState(orderId);
      const runId = "sr-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
      runs.set(runId, state);
      return { runId, state };
    },
  );
}

export function stepOnceSR(runId: string): { runId: string; state: SRState; stopped: boolean } {
  return logCall(
    "走一步业务例子",
    "stepOnceSR",
    "本步核心：跑当前节点、路由挑下一站、验边、合并。**不**调 writeCheckpoint——本步只演示「同图同 runId」判定",
    { runId },
    stepOnceSR.toString(),
    {
      before: "走这一步之前的状态",
      state: "走完后的新状态",
      stopped: "是否已到 done 终止站",
    },
    () => {
      const before = runs.get(runId);
      if (!before) {
        throw Object.assign(
          new Error("内存里找不到这件业务例子任务运行。"),
          { code: "RUN_NOT_FOUND" },
        );
      }
      if (isSRTerminal(before.currentNode)) {
        throw Object.assign(new Error(`已经停在终止站 ${before.currentNode}`), {
          code: "ALREADY_STOPPED",
        });
      }
      const from = before.currentNode;
      const nodeFn = SR_NODES[from];
      const patch = nodeFn(before);
      const afterNode: SRState = { ...before, ...patch };
      const next = srRouteAfter(from, afterNode);
      if (!isLegalSREdge(from, next)) {
        throw Object.assign(new Error(`非法转移：${from} 不能去 ${next}`), { code: "ILLEGAL_EDGE" });
      }
      const state: SRState = {
        ...afterNode,
        currentNode: next,
        completedNodes: [...before.completedNodes, from],
      };
      runs.set(runId, state);
      return { runId, state, stopped: isSRTerminal(state.currentNode) };
    },
  );
}

export function hasSRRun(runId: string): boolean {
  return runs.has(runId);
}
