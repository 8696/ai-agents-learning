/**
 * 本步核心：分流站一次走一步同时跑两臂，只合并各自改的字段。
 * 职责：建订单 + 跑当前站（分流站跑两臂）→ 验边 → 写下 currentNode。
 * 数据流：createOrder 停在 takeOrder；分流合并后两边都在则 assemble，合错则 failEnd，HTTP 200。
 * 为什么单独成文件：并行超步不能塞进带回边的 cafe-step-once。
 */
import { logger } from "../logger.js";
import {
  NODE_FNS,
  type NodeId,
  type ParallelState,
  brewShotPatch,
  graphSnapshot,
  isLegalEdge,
  isTerminal,
  pickFields,
  pickRoute,
  stationOf,
  steamMilkPatch,
} from "./parallel-graph.js";
import { buildParallelBoard, type ObjectBoard } from "./parallel-view.js";

export class ClientError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ClientError";
  }
}

export type Transition = {
  from: NodeId;
  to: NodeId;
  condition: string;
  read: Record<string, unknown>;
  wrote: Record<string, unknown>;
};

export type OrderCreated = {
  kind: "created";
  state: ParallelState;
  graph: ReturnType<typeof graphSnapshot>;
  objectBoard: ObjectBoard;
};

export type StepResult = {
  kind: "step";
  before: ParallelState;
  state: ParallelState;
  transition: Transition;
  graph: ReturnType<typeof graphSnapshot>;
  objectBoard: ObjectBoard;
};

export function createOrder(drinkName: string): OrderCreated {
  const t0 = Date.now();
  logger.info(
    "调用函数-createOrder",
    "调用函数开始：createOrder",
    "为什么写这条日志：并行页下单只是进图。当前：准备写出入口状态。",
    { 入参: { drinkName }, __code: createOrder.toString() },
  );
  const said = drinkName.trim();
  if (!said) {
    const err = new ClientError("饮品名不能为空。左边输入框写你要点的咖啡再下单。");
    logger.error(
      "调用函数-createOrder",
      "调用函数结束：createOrder（失败）",
      "为什么写这条日志：空饮品名建不出订单。当前：返回 400。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  const state: ParallelState = {
    orderId: `PAR-${String(Date.now()).slice(-6)}`,
    currentNode: "takeOrder",
    drinkName: said,
    drinkType: null,
    orderSlip: null,
    shotReady: null,
    milkReady: null,
    pickupCall: null,
    lastError: null,
    mergeMode: said.includes("合错") ? "whole" : "own",
  };
  const 返回值: OrderCreated = {
    kind: "created",
    state,
    graph: graphSnapshot(),
    objectBoard: buildParallelBoard({ lastAction: "created", state, before: null, transition: null }),
  };
  logger.info(
    "调用函数-createOrder",
    "调用函数结束：createOrder",
    "为什么写这条日志：页面要用入口 State。当前：停在 takeOrder。",
    { 返回值, 耗时ms: Date.now() - t0, 字段释义: { currentNode: "入口节点", mergeMode: "own=只合并自己的字段；whole=合错对照" } },
  );
  return 返回值;
}

function runParallelArms(state: ParallelState): Partial<ParallelState> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-runParallelArms",
    "调用函数开始：runParallelArms",
    "为什么写这条日志：分流站一次跑两臂。当前：准备出浓缩和打奶。",
    { 入参: { state }, __code: runParallelArms.toString() },
  );
  const shot = brewShotPatch(state);
  const milk = steamMilkPatch(state);
  const patch: Partial<ParallelState> = { ...shot, ...milk };
  const both = Boolean(patch.shotReady && patch.milkReady);
  if (!both) {
    patch.lastError = "合错了：后合并的那份把另一臂的字段盖成空。节点必须只 return 自己改的字段。";
  } else {
    patch.lastError = null;
  }
  logger.info(
    "│ 调用函数-runParallelArms",
    "调用函数结束：runParallelArms",
    "为什么写这条日志：两份补丁已经按对象展开合并。当前：马上问路由。",
    {
      返回值: { shot, milk, patch, both },
      耗时ms: Date.now() - t0,
      字段释义: {
        shot: "出浓缩的补丁",
        milk: "打奶的补丁",
        "patch.shotReady": "合并后浓缩是否还在",
        "patch.milkReady": "合并后奶是否还在",
      },
    },
  );
  return patch;
}

export function stepOnce(state: ParallelState): StepResult {
  const t0 = Date.now();
  logger.info(
    "调用函数-stepOnce",
    "调用函数开始：stepOnce",
    "为什么写这条日志：这是并行页核心——分流站一次跑两臂再验边。当前：准备走一步。",
    { 入参: { state }, __code: stepOnce.toString() },
  );
  if (isTerminal(state.currentNode)) {
    const err = new ClientError("已经到达终止站，没有出边。点「再点一杯」才开新订单。");
    logger.error(
      "调用函数-stepOnce",
      "调用函数结束：stepOnce（失败）",
      "为什么写这条日志：完成站再点走一步没有意义。当前：返回 400。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  const from = state.currentNode;
  const station = stationOf(from);
  let patch: Partial<ParallelState>;
  if (from === "fork") {
    patch = runParallelArms(state);
  } else if (from === "takeOrder" || from === "assemble") {
    const innerT0 = Date.now();
    logger.info(
      "│ 调用函数-runNode",
      "调用函数开始：runNode",
      "为什么写这条日志：普通站只跑一个节点函数。当前：正在跑这一站。",
      { 入参: { from, state }, __code: `${from}Node(state)` },
    );
    patch = NODE_FNS[from](state);
    logger.info(
      "│ 调用函数-runNode",
      "调用函数结束：runNode",
      "为什么写这条日志：这一站写出的字段要进 State。当前：马上问边表。",
      { 返回值: patch, 耗时ms: Date.now() - innerT0 },
    );
  } else {
    throw new ClientError(`节点 ${from} 没有可跑的函数。`);
  }
  const afterNode: ParallelState = { ...state, ...patch };
  const routed = pickRoute(from, afterNode);
  const illegal = !isLegalEdge(from, routed.to);
  const after: ParallelState = {
    ...afterNode,
    lastError: illegal
      ? `非法转移：从 ${from} 不能到 ${routed.to}。`
      : afterNode.lastError,
    currentNode: illegal ? "failEnd" : routed.to,
  };
  const transition: Transition = {
    from,
    to: after.currentNode,
    condition: illegal ? "非法转移被拦住" : routed.condition,
    read: pickFields(state, station.reads),
    wrote: pickFields(after, station.writes),
  };
  const 返回值: StepResult = {
    kind: "step",
    before: state,
    state: after,
    transition,
    graph: graphSnapshot(),
    objectBoard: buildParallelBoard({ lastAction: "step", state: after, before: state, transition }),
  };
  logger.info(
    "调用函数-stepOnce",
    "调用函数结束：stepOnce",
    "为什么写这条日志：页面要用转移前后的 State。当前：一次转移已完成。",
    {
      返回值,
      耗时ms: Date.now() - t0,
      字段释义: {
        "state.shotReady": "浓缩臂写回的字段",
        "state.milkReady": "打奶臂写回的字段",
        "state.mergeMode": "own 合得对；whole 合错对照",
        "state.currentNode": "转移后的当前节点",
      },
    },
  );
  return 返回值;
}
