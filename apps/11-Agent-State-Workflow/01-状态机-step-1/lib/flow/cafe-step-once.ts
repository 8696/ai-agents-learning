/**
 * 本步核心：咖啡店走一步调度器；验边拦住非法转移，制作失败沿回边再进同一站。
 * 职责：建订单 + 跑当前节点 → 丢掉节点擅自写的 currentNode → 问路由 → 验边 → 写下新的当前节点。
 * 数据流：createOrder 停在 takeOrder；下一站不在出边名单时写 lastError 走进 failEnd，HTTP 仍 200。
 * 为什么单独成文件：咖啡店各页共用这份调度器；FAQ 线性图另有 step-once.ts。
 */
import { logger } from "../logger.js";
import {
  NODE_FNS,
  type CafeState,
  type NodeId,
  graphSnapshot,
  isLegalEdge,
  isTerminal,
  pickFields,
  pickRoute,
  stationOf,
} from "./cafe-graph.js";
import { buildObjectBoard, type ObjectBoard } from "./object-view.js";

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
  state: CafeState;
  graph: ReturnType<typeof graphSnapshot>;
  objectBoard: ObjectBoard;
};

export type StepResult = {
  kind: "step";
  before: CafeState;
  state: CafeState;
  transition: Transition;
  graph: ReturnType<typeof graphSnapshot>;
  objectBoard: ObjectBoard;
};

export function createOrder(drinkName: string): OrderCreated {
  const t0 = Date.now();
  logger.info(
    "调用函数-createOrder",
    "调用函数开始：createOrder",
    "为什么写这条日志：顾客点单只是进图，还没跑第一站。当前：准备写出入口状态。",
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
  const state: CafeState = {
    orderId: `CAF-${String(Date.now()).slice(-6)}`,
    currentNode: "takeOrder",
    drinkName: said,
    drinkType: null,
    orderSlip: null,
    cupLabel: null,
    pickupCall: null,
    lastError: null,
    retryCount: 0,
  };
  const 返回值: OrderCreated = {
    kind: "created",
    state,
    graph: graphSnapshot(),
    objectBoard: buildObjectBoard({ lastAction: "created", state, before: null, transition: null }),
  };
  logger.info(
    "调用函数-createOrder",
    "调用函数结束：createOrder",
    "为什么写这条日志：页面要用入口 State 标出当前站。当前：停在 takeOrder，还没走一步。",
    { 返回值, 耗时ms: Date.now() - t0, 字段释义: { currentNode: "入口节点", drinkName: "开场唯一有值的业务字段" } },
  );
  return 返回值;
}

function routeNext(from: NodeId, state: CafeState): { to: NodeId; condition: string; readsField: string | null } {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-routeNext",
    "调用函数开始：routeNext",
    "为什么写这条日志：下一站必须来自边表，并由路由读 State 挑选。当前：刚跑完这一站。",
    { 入参: { from, drinkType: state.drinkType, retryCount: state.retryCount, cupLabel: state.cupLabel }, __code: routeNext.toString() },
  );
  try {
    const 返回值 = pickRoute(from, state);
    logger.info(
      "│ 调用函数-routeNext",
      "调用函数结束：routeNext",
      "为什么写这条日志：路由读字段后 return 下一站。当前：马上验边、写下当前节点。",
      { 返回值, 耗时ms: Date.now() - t0, 字段释义: { drinkType: "点单后分流", retryCount: "制作失败次数，回边读它", cupLabel: "有值走出餐，空则看次数" } },
    );
    return 返回值;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const err = new ClientError(message);
    logger.error(
      "│ 调用函数-routeNext",
      "调用函数结束：routeNext（失败）",
      "为什么写这条日志：没有出边，或条件没写穷尽。当前：返回 400。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function stepOnce(state: CafeState, forceIllegalNext?: NodeId): StepResult {
  const t0 = Date.now();
  logger.info(
    "调用函数-stepOnce",
    "调用函数开始：stepOnce",
    "为什么写这条日志：这是本步核心——跑当前站后验边；边表没有的下一站不能写进 currentNode。当前：准备走一步。",
    { 入参: { state, forceIllegalNext: forceIllegalNext ?? null }, __code: stepOnce.toString() },
  );
  if (isTerminal(state.currentNode)) {
    const where = state.currentNode === "failEnd" ? "无法制作（失败终止）" : "完成站";
    const err = new ClientError(`已经到达${where}，没有出边。点「再点一杯」才开新订单。`);
    logger.error(
      "调用函数-stepOnce",
      "调用函数结束：stepOnce（失败）",
      "为什么写这条日志：完成站再点走一步没有意义。当前：返回 400。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  const from = state.currentNode;
  if (from === "okEnd" || from === "failEnd") {
    throw new ClientError("已经到达终止站。");
  }
  const station = stationOf(from);
  const fn = NODE_FNS[from];
  const innerT0 = Date.now();
  logger.info(
    "│ 调用函数-runNode",
    "调用函数开始：runNode",
    "为什么写这条日志：节点只写业务字段，不改 currentNode。当前：正在跑这一站。",
    { 入参: { from, state }, __code: `${from}Node(state)` },
  );
  const rawPatch: Partial<CafeState> = forceIllegalNext
    ? { ...fn(state), currentNode: forceIllegalNext }
    : fn(state);
  const patch: Partial<CafeState> = { ...rawPatch };
  delete patch.currentNode;
  logger.info(
    "│ 调用函数-runNode",
    "调用函数结束：runNode",
    "为什么写这条日志：这一站写出的字段要进 State；currentNode 若被节点写上，调度器会丢掉。当前：马上问边表。",
    {
      返回值: rawPatch,
      调度器丢掉的currentNode: rawPatch.currentNode ?? null,
      合并进State的字段: patch,
      耗时ms: Date.now() - innerT0,
    },
  );
  const afterNode: CafeState = { ...state, ...patch };
  const routed = forceIllegalNext
    ? { to: forceIllegalNext, condition: "故意指定一条边表里没有的路", readsField: null }
    : routeNext(from, afterNode);
  const illegal = !isLegalEdge(from, routed.to);
  const lastError = illegal
    ? `非法转移：从 ${from} 不能到 ${routed.to}。点单站的出边只有热饮制作 / 冰饮制作 / 无法制作。调度器拦住，走进失败终止。`
    : afterNode.lastError;
  const after: CafeState = {
    ...afterNode,
    lastError,
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
    objectBoard: buildObjectBoard({ lastAction: "step", state: after, before: state, transition }),
  };
  logger.info(
    "调用函数-stepOnce",
    "调用函数结束：stepOnce",
    "为什么写这条日志：页面要用转移前后的 State 和边。当前：一次转移已完成。",
    {
      返回值,
      耗时ms: Date.now() - t0,
      字段释义: {
        "transition.from": "刚跑完的站",
        "transition.to": "验边通过则是路由的下一站；拦住则是 failEnd",
        "transition.read": "这一站读了哪些字段",
        "transition.wrote": "这一站写了哪些字段",
        "state.currentNode": "转移后的当前节点",
        "state.lastError": "非法转移时写下拦下的原因",
      },
    },
  );
  return 返回值;
}
