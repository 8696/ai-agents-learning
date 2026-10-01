/**
 * 本步核心：用 LangGraph 的状态图（State Graph）演示条件分流。
 *
 * 起点仍是 START → takeOrder → classifyDrink，classifyDrink 写完 drinkType 之后
 * 接一条 addConditionalEdges（路由函数读 drinkType，路径映射把键翻成目标节点）：
 *   hot      → brewHot      → serve → END
 *   ice      → brewIce      → serve → END
 *   unknown  → reject       → END
 *
 * 职责：装配条件图 + 跑一遍 + 把「这次走了哪条边」算出来（满足需求 2）。
 * 数据流：drinkName → buildConditionalGraph → stream(updates) → 每一站 patch + 合并后状态 + routeChosen。
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 *
 * 与线性图（linear-graph.ts）的区别：本图多了 drinkType / errorReason 两个字段，多了 classifyDrink /
 * brewIce / reject 三个节点，边里夹一条 addConditionalEdges。节点函数签名仍然是
 * 吃状态、只 return 自己改的字段（手写版那一套规则不变）。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  brewHotDrink,
  brewIceDrink,
  classifyDrink,
  notifyPickup,
  placeOrder,
  type DrinkType,
} from "../tools/cafe-tools.js";

export const DEFAULT_DRINK_CONDITIONAL = "来一杯中杯热拿铁。";

export type ConditionalCafeState = {
  drinkName: string;
  orderSlip: string | null;
  drinkType: DrinkType | null;
  cupLabel: string | null;
  pickupCall: string | null;
  errorReason: string | null;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

const ConditionalStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  drinkType: Annotation<DrinkType | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  errorReason: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});

export async function takeOrderNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}

export async function classifyDrinkNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  // 用 state.drinkName（客人口述原文），不要用 state.orderSlip——订单条文本可能被 placeOrder
  // 加过后缀，会污染分类判断。例如 placeOrder 给所有订单条加「→ 双份浓缩，热」会让抹茶也命中「热」。
  const result = await classifyDrink({ drinkName: state.drinkName });
  return { drinkType: result.drinkType };
}

export async function brewHotNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const drink = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: drink.cupLabel };
}

export async function brewIceNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const drink = await brewIceDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: drink.cupLabel };
}

export async function serveNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}

export async function rejectNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  return {
    pickupCall: "菜单上没有「" + (state.drinkName || "") + "」。",
    errorReason: "分类结果 drinkType = unknown，对应路径映射里的 reject 节点。",
  };
}

const NODE_LABELS: Record<string, string> = {
  takeOrder: "点单",
  classifyDrink: "饮品分类",
  brewHot: "热饮制作",
  brewIce: "冰饮制作",
  serve: "出餐",
  reject: "无法制作",
};

export type ConditionalRuntimeStep = {
  node: string;
  label: string;
  patch: Partial<ConditionalCafeState>;
  stateAfter: ConditionalCafeState;
};

export type RouteChosen = {
  fromNode: string;
  pickedKey: string;
  toNode: string;
  readField: string;
  readValue: string | null;
};

export function routeAfterClassify(state: ConditionalCafeState): "hot" | "ice" | "unknown" {
  // 路由函数：读 state.drinkType，返回键；键再被路径映射翻成目标节点。
  // 路由函数本身不是节点，**不会**写 state；返回的键就是这次路由的依据。
  return state.drinkType ?? "unknown";
}

export function buildConditionalGraph() {
  return new StateGraph(ConditionalStateAnnotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("classifyDrink", classifyDrinkNode)
    .addNode("brewHot", brewHotNode)
    .addNode("brewIce", brewIceNode)
    .addNode("serve", serveNode)
    .addNode("reject", rejectNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "classifyDrink")
    .addConditionalEdges(
      "classifyDrink",
      routeAfterClassify,
      { hot: "brewHot", ice: "brewIce", unknown: "reject" },
    )
    .addEdge("brewHot", "serve")
    .addEdge("brewIce", "serve")
    .addEdge("serve", END)
    .addEdge("reject", END)
    .compile();
}

export async function runConditionalGraph(drinkName: string): Promise<{
  input: ConditionalCafeState;
  runtime: ConditionalRuntimeStep[];
  finalState: ConditionalCafeState;
  routeChosen: RouteChosen | null;
}> {
  const graph = buildConditionalGraph();
  const input: ConditionalCafeState = {
    drinkName,
    orderSlip: null,
    drinkType: null,
    cupLabel: null,
    pickupCall: null,
    errorReason: null,
  };
  const runtime: ConditionalRuntimeStep[] = [];
  let merged: ConditionalCafeState = { ...input };
  const stream = await graph.stream(input, { streamMode: "updates" });
  for await (const chunk of stream) {
    const keys = Object.keys(chunk);
    for (const node of keys) {
      const patch = (chunk as Record<string, Partial<ConditionalCafeState>>)[node] ?? {};
      merged = { ...merged, ...patch };
      const label = NODE_LABELS[node] ?? node;
      runtime.push({
        node,
        label,
        patch,
        stateAfter: { ...merged },
      });
    }
  }
  // 计算「这次走了哪条边」：在 runtime 里找 classifyDrink 之后的那一站。
  // 这一信息手写版写在 EDGES 表的 condition / readsField 两列里；框架版路由函数不写 state，
  // 所以从最终合并后的 drinkType 反推 pickedKey，告知前端「读了 drinkType = 什么 → 走了谁」。
  let routeChosen: RouteChosen | null = null;
  const classifyIndex = runtime.findIndex(function (step) { return step.node === "classifyDrink"; });
  if (classifyIndex >= 0 && classifyIndex + 1 < runtime.length) {
    const drinkType = merged.drinkType;
    routeChosen = {
      fromNode: "classifyDrink",
      pickedKey: drinkType ?? "unknown",
      toNode: runtime[classifyIndex + 1].node,
      readField: "drinkType",
      readValue: drinkType,
    };
  }
  return { input, runtime, finalState: merged, routeChosen };
}
