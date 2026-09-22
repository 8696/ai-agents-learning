/**
 * 本步核心：用 LangGraph 的状态图（State Graph）声明一条最简单的线性出杯图
 * （点单 → 热饮制作 → 出餐），compile 之后 stream 一次，把每一站的补丁吐出来。
 *
 * 职责：装配线性图 + 跑一遍。页面上的声明说明在 linear-graph-view.ts；
 *                       展示用的源代码字面量在 linear-graph-source.ts。
 * 数据流：drinkName → buildLinearGraph → stream(updates) → 每一站 patch + 合并后的状态。
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  brewHotDrink,
  notifyPickup,
  placeOrder,
} from "../tools/cafe-tools.js";

export const DEFAULT_DRINK = "来一杯中杯热拿铁。";

export type CafeState = {
  drinkName: string;
  orderSlip: string | null;
  cupLabel: string | null;
  pickupCall: string | null;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

const CafeStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});

export async function takeOrderNode(state: CafeState): Promise<Partial<CafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}

export async function brewHotNode(state: CafeState): Promise<Partial<CafeState>> {
  const drink = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: drink.cupLabel };
}

export async function serveNode(state: CafeState): Promise<Partial<CafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}

const NODE_LABELS: Record<"takeOrder" | "brewHot" | "serve", string> = {
  takeOrder: "点单",
  brewHot: "热饮制作",
  serve: "出餐",
};

export type RuntimeStep = {
  node: string;
  label: string;
  patch: Partial<CafeState>;
  stateAfter: CafeState;
};

export function buildLinearGraph() {
  return new StateGraph(CafeStateAnnotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("brewHot", brewHotNode)
    .addNode("serve", serveNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "brewHot")
    .addEdge("brewHot", "serve")
    .addEdge("serve", END)
    .compile();
}

export async function runLinearGraph(drinkName: string): Promise<{
  input: CafeState;
  runtime: RuntimeStep[];
  finalState: CafeState;
}> {
  const graph = buildLinearGraph();
  const input: CafeState = {
    drinkName,
    orderSlip: null,
    cupLabel: null,
    pickupCall: null,
  };
  const runtime: RuntimeStep[] = [];
  let merged: CafeState = { ...input };
  const stream = await graph.stream(input, { streamMode: "updates" });
  for await (const chunk of stream) {
    const keys = Object.keys(chunk);
    for (const node of keys) {
      const patch = (chunk as Record<string, Partial<CafeState>>)[node] ?? {};
      merged = { ...merged, ...patch };
      const label = NODE_LABELS[node as keyof typeof NODE_LABELS] ?? node;
      runtime.push({
        node,
        label,
        patch,
        stateAfter: { ...merged },
      });
    }
  }
  return { input, runtime, finalState: merged };
}