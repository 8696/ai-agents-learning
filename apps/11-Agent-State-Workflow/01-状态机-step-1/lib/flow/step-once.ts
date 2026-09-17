/**
 * 本步核心：走一步调度器。
 * 职责：建工单（入口状态）+ 跑当前节点 → 问边表 → 写下新的 currentNode。节点函数不得自己改当前站。
 * 数据流：createTicket(问句) 得到停在 rewrite 的 State；stepOnce(State) 只转移一站并返回读/写差。
 * 为什么单独成文件：线性 FAQ 页先打开本文件看「一步 = 一次状态转移」；咖啡店图另有 cafe-step-once.ts。
 */
import { logger } from "../logger.js";
import {
  EDGES,
  NODE_FNS,
  type FaqState,
  type NodeId,
  graphSnapshot,
  isTerminal,
  pickFields,
  stationOf,
} from "./faq-graph.js";

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

export type TicketCreated = {
  kind: "created";
  state: FaqState;
  graph: ReturnType<typeof graphSnapshot>;
};

export type StepResult = {
  kind: "step";
  before: FaqState;
  state: FaqState;
  transition: Transition;
  graph: ReturnType<typeof graphSnapshot>;
};

export function createTicket(userQuestion: string): TicketCreated {
  const t0 = Date.now();
  logger.info(
    "调用函数-createTicket",
    "调用函数开始：createTicket",
    "为什么写这条日志：用户发问只是进图，还没跑第一站。当前：准备写出入口状态。",
    { 入参: { userQuestion }, __code: createTicket.toString() },
  );
  const question = userQuestion.trim();
  if (!question) {
    const err = new ClientError("问句不能为空。左边输入框写一句再发送。");
    logger.error(
      "调用函数-createTicket",
      "调用函数结束：createTicket（失败）",
      "为什么写这条日志：空问句建不出工单。当前：返回 400。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  const state: FaqState = {
    ticketId: `FAQ-${String(Date.now()).slice(-6)}`,
    currentNode: "rewrite",
    userQuestion: question,
    rewrittenQuery: null,
    hits: null,
    replyDraft: null,
  };
  const 返回值: TicketCreated = { kind: "created", state, graph: graphSnapshot() };
  logger.info(
    "调用函数-createTicket",
    "调用函数结束：createTicket",
    "为什么写这条日志：页面要把这份入口 State 标出当前站。当前：停在 rewrite，还没走一步。",
    { 返回值, 耗时ms: Date.now() - t0, 字段释义: { currentNode: "入口节点", userQuestion: "开场唯一有值的业务字段" } },
  );
  return 返回值;
}

function routeNext(from: NodeId): { to: NodeId; condition: string } {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-routeNext",
    "调用函数开始：routeNext",
    "为什么写这条日志：下一站必须来自边表，不能让节点自己改 currentNode。当前：刚跑完这一站。",
    { 入参: { from }, __code: routeNext.toString() },
  );
  const edge = EDGES.find((row) => row.from === from);
  if (!edge) {
    const err = new ClientError(`节点 ${from} 没有出边，不能再走一步。`);
    logger.error(
      "│ 调用函数-routeNext",
      "调用函数结束：routeNext（失败）",
      "为什么写这条日志：终止站没有出边。当前：应停在完成。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  const 返回值 = { to: edge.to, condition: edge.condition };
  logger.info(
    "│ 调用函数-routeNext",
    "调用函数结束：routeNext",
    "为什么写这条日志：边表决定下一站。当前：无条件走到下一站。",
    { 返回值, 耗时ms: Date.now() - t0 },
  );
  return 返回值;
}

export function stepOnce(state: FaqState): StepResult {
  const t0 = Date.now();
  logger.info(
    "调用函数-stepOnce",
    "调用函数开始：stepOnce",
    "为什么写这条日志：这是本步核心——只跑当前站、只转移一次。当前：准备走一步。",
    { 入参: { state }, __code: stepOnce.toString() },
  );
  if (isTerminal(state.currentNode)) {
    const err = new ClientError("已经到达完成站，没有出边。点「再问一次」才开新工单。");
    logger.error(
      "调用函数-stepOnce",
      "调用函数结束：stepOnce（失败）",
      "为什么写这条日志：完成站再点走一步没有意义。当前：返回 400。",
      { 返回值: { name: err.name, message: err.message }, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
  const from = state.currentNode;
  if (from === "okEnd") throw new ClientError("已经到达完成站。");
  const station = stationOf(from);
  const fn = NODE_FNS[from];
  const innerT0 = Date.now();
  logger.info(
    "│ 调用函数-runNode",
    "调用函数开始：runNode",
    "为什么写这条日志：节点只写业务字段，不改 currentNode。当前：正在跑这一站。",
    { 入参: { from, state }, __code: `${from}Node(state)` },
  );
  const patch = fn(state);
  logger.info(
    "│ 调用函数-runNode",
    "调用函数结束：runNode",
    "为什么写这条日志：这一站写回的字段要进 State。当前：马上问边表。",
    { 返回值: patch, 耗时ms: Date.now() - innerT0 },
  );
  const afterNode: FaqState = { ...state, ...patch };
  const next = routeNext(from);
  const after: FaqState = { ...afterNode, currentNode: next.to };
  const transition: Transition = {
    from,
    to: next.to,
    condition: next.condition,
    read: pickFields(state, station.reads),
    wrote: pickFields(after, station.writes),
  };
  const 返回值: StepResult = {
    kind: "step",
    before: state,
    state: after,
    transition,
    graph: graphSnapshot(),
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
        "transition.to": "边表给出的下一站",
        "transition.read": "这一站读了哪些字段",
        "transition.wrote": "这一站写了哪些字段",
        "state.currentNode": "转移后的当前节点",
      },
    },
  );
  return 返回值;
}
