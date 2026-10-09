/**
 * 本步核心：用 LangGraph 的状态图演示回边循环（变体 C）。
 *
 * 起点仍是 START → takeOrder → brewHot，brewHot 之后接一条 addConditionalEdges：
 *   success   → serve    → END
 *   retry     → brewHot  （自己）
 *   exceeded  → reject   → END
 *
 * 三个 mode 控制 brewHot 站每次出杯还是出空杯：
 *   smooth     第 1 次就出杯 → success
 *   retry-once 第 1 次空杯、第 2 次出杯 → 第 1 次走 retry → brewHot，第 2 次走 success → serve
 *   fail       第 1/2/3 次都空杯 → 全部走 retry → brewHot，第 3 次走 exceeded → reject
 *
 * 职责：装配回边图 + 跑一遍 + 把「这次为什么走哪条边」算出来。
 * 数据流：drinkName + mode → buildBackEdgeGraph → stream(updates) → 每一站 patch + 合并后状态 + routeChosen。
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 *
 * 与条件分流图（conditional-graph.ts）的区别：本图少了 classifyDrink / brewIce 两站，多了
 * retryCount 字段；条件边从 brewHot 出发指回自己（回边），收敛靠 retryCount < 3。
 * 节点函数签名仍然吃状态、只 return 自己改的字段。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  notifyPickup,
  placeOrder,
} from "../tools/cafe-tools.js";

export const DEFAULT_DRINK_BACK_EDGE = "来一杯中杯热拿铁。";

export type BackEdgeMode = "smooth" | "retry-once" | "fail";

export type BackEdgeCafeState = {
  drinkName: string;
  mode: BackEdgeMode;
  orderSlip: string | null;
  retryCount: number | null;
  cupLabel: string | null;
  pickupCall: string | null;
  errorReason: string | null;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

const BackEdgeStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode: Annotation<BackEdgeMode>({ reducer: lastWrite, default: () => "smooth" as BackEdgeMode }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  retryCount: Annotation<number | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  errorReason: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});

export async function takeOrderNode(state: BackEdgeCafeState): Promise<Partial<BackEdgeCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}

export async function brewHotNode(state: BackEdgeCafeState): Promise<Partial<BackEdgeCafeState>> {
  // 把"第几次做"写进 retryCount；cupLabel 这次该不该出杯由 mode 决定。
  const nextCount = (state.retryCount ?? 0) + 1;
  let cupLabel: string | null;
  if (state.mode === "smooth") {
    cupLabel = `热杯。杯盖写着「${state.orderSlip ?? ""}」。第 ${nextCount} 次出杯，放在热饮区。`;
  } else if (state.mode === "retry-once") {
    cupLabel = nextCount >= 2
      ? `热杯。杯盖写着「${state.orderSlip ?? ""}」。第 ${nextCount} 次重做出杯，放在热饮区。`
      : null;
  } else {
    // mode === "fail"
    cupLabel = null;
  }
  return { retryCount: nextCount, cupLabel };
}

export async function serveNode(state: BackEdgeCafeState): Promise<Partial<BackEdgeCafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}

export async function rejectNode(state: BackEdgeCafeState): Promise<Partial<BackEdgeCafeState>> {
  return {
    pickupCall: `「${state.drinkName}」重做 ${state.retryCount ?? 0} 次仍空杯，无法出杯。`,
    errorReason: `cupLabel 仍为空，retryCount = ${state.retryCount ?? 0}，超过上限 3；走 reject。`,
  };
}

export function routeAfterBrew(state: BackEdgeCafeState): "success" | "retry" | "exceeded" {
  // 路由函数：读 state.cupLabel 和 state.retryCount，返回键；键被路径映射翻成目标节点。
  // 路由函数本身不是节点，**不会**写 state；返回的键就是这次路由的依据。
  if (state.cupLabel) return "success";
  if ((state.retryCount ?? 0) < 3) return "retry";
  return "exceeded";
}

const NODE_LABELS: Record<string, string> = {
  takeOrder: "点单",
  brewHot: "热饮制作（重做站）",
  serve: "出餐",
  reject: "无法制作",
};

export type BackEdgeRuntimeStep = {
  node: string;
  label: string;
  patch: Partial<BackEdgeCafeState>;
  stateAfter: BackEdgeCafeState;
};

export type BackEdgeRouteChosen = {
  fromNode: string;
  pickedKey: string;
  toNode: string;
  readField: string;
  readValue: string | number | null;
};

export function buildBackEdgeGraph() {
  return new StateGraph(BackEdgeStateAnnotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("brewHot", brewHotNode)
    .addNode("serve", serveNode)
    .addNode("reject", rejectNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "brewHot")
    .addConditionalEdges(
      "brewHot",
      routeAfterBrew,
      { success: "serve", retry: "brewHot", exceeded: "reject" },
    )
    .addEdge("serve", END)
    .addEdge("reject", END)
    .compile();
}

export async function runBackEdgeGraph(drinkName: string, mode: BackEdgeMode): Promise<{
  input: BackEdgeCafeState;
  runtime: BackEdgeRuntimeStep[];
  finalState: BackEdgeCafeState;
  routeChosen: BackEdgeRouteChosen | null;
}> {
  const graph = buildBackEdgeGraph();
  const input: BackEdgeCafeState = {
    drinkName,
    mode,
    orderSlip: null,
    retryCount: null,
    cupLabel: null,
    pickupCall: null,
    errorReason: null,
  };
  const runtime: BackEdgeRuntimeStep[] = [];
  let merged: BackEdgeCafeState = { ...input };
  const stream = await graph.stream(input, { streamMode: "updates" });
  for await (const chunk of stream) {
    const keys = Object.keys(chunk);
    for (const node of keys) {
      const patch = (chunk as Record<string, Partial<BackEdgeCafeState>>)[node] ?? {};
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
  // 计算「这次为什么走这条边」：在 runtime 里找 brewHot 最后一次之后的那一站。
  // 这一信息手写版写在 EDGES 表的 condition / readsField 两列里；框架版路由函数不写 state，
  // 所以从最终合并后的 cupLabel + retryCount 反推 pickedKey。
  let routeChosen: BackEdgeRouteChosen | null = null;
  const brewIndices: number[] = [];
  runtime.forEach(function (step, i) { if (step.node === "brewHot") brewIndices.push(i); });
  const lastBrewIndex = brewIndices[brewIndices.length - 1];
  if (lastBrewIndex !== undefined && lastBrewIndex + 1 < runtime.length) {
    const nextStep = runtime[lastBrewIndex + 1];
    const cupLabel = merged.cupLabel;
    const retryCount = merged.retryCount;
    const pickedKey = cupLabel
      ? "success"
      : retryCount !== null && retryCount < 3
        ? "retry"
        : "exceeded";
    const readField = pickedKey === "success" ? "cupLabel" : "retryCount";
    const readValue = pickedKey === "success" ? cupLabel : retryCount;
    routeChosen = {
      fromNode: "brewHot",
      pickedKey,
      toNode: nextStep.node,
      readField,
      readValue,
    };
  }
  return { input, runtime, finalState: merged, routeChosen };
}
