/**
 * 职责：装配三张图（normal / invalid-edge / route-fallback 三种 mode）+ 跑一遍 + 计算每一站 patch。
 * 形状：START → takeOrder → classifyDrink → 条件边（路由函数读 drinkType 决定下一站）
 *                     ├─→ brewHot  → serve → END
 *                     ├─→ brewIce  → serve → END
 *                     └─→ reject   → END（菜单上没有 / 路由函数兜底）
 *
 * 三个 mode 控制「路由函数返回的键在 pathMap 里找不到」时的行为：
 *   normal          pathMap 含 { hot, ice, unknown } → 三种 drinkType 都跑通
 *   invalid-edge    pathMap 只含 { hot, ice }（缺 unknown）→ 路由返回 "unknown" 时 framework 抛异常
 *   route-fallback  路由函数对未识别 drinkType 返回 "reject" → 优雅走进 reject → END
 *
 * 数据流：drinkName + mode → buildInvalidEdgeGraph → stream(updates) → 每一站 patch + 合并后状态。
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 *
 * 与条件分流图（step-1）的区别：图结构相同，差别只在「pathMap 是否完整」+「路由函数是否兜底」。
 * 与模块 11 手写版的 diff：手写版「边表里查不到」是业务级拦截（自定义错误文案 + 走失败终止站）；
 * 框架版「pathMap 里查不到」是接口级报错（异常，没有业务文案）。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  classifyDrink,
  notifyPickup,
  placeOrder,
  brewHotDrink,
  brewIceDrink,
  type DrinkType,
} from "../tools/cafe-tools.js";

export type InvalidEdgeMode = "normal" | "invalid-edge" | "route-fallback";

export const DEFAULT_DRINK_INVALID_EDGE = "来一杯中杯热拿铁。";

export type InvalidEdgeCafeState = {
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

const InvalidEdgeStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  drinkType: Annotation<DrinkType | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  errorReason: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});

export async function takeOrderNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}

export async function classifyDrinkNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  // 沿用 cafe-tools.ts 的 classifyDrink：根据 drinkName 文本判定饮品分类
  const result = await classifyDrink({ drinkName: state.drinkName });
  return { drinkType: result.drinkType };
}

export async function brewHotNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const hot = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: hot.cupLabel };
}

export async function brewIceNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const ice = await brewIceDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: ice.cupLabel };
}

export async function serveNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}

export async function rejectNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  return {
    pickupCall: `「${state.drinkName}」菜单上没有，请重新点单。`,
    errorReason: `drinkType = ${state.drinkType ?? "null"}（不识别）；走进 reject 终止站。`,
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

/**
 * 路由函数：读 state.drinkType，按 mode 决定行为。
 *   normal          直接返回 drinkType；pathMap 完整，三种都跑通
 *   invalid-edge    直接返回 drinkType；pathMap 缺 "unknown" → 框架抛「pathMap 里没有这个键」
 *   route-fallback  drinkType 在 pathMap 里就返回；不在就返回 "reject"（兜底）
 */
function routeAfterClassify(state: InvalidEdgeCafeState, mode: InvalidEdgeMode, pathMap: Record<string, string>): string {
  const dt = state.drinkType ?? "unknown";
  if (mode === "route-fallback") {
    return dt in pathMap ? dt : "reject";
  }
  return dt;
}

export type InvalidEdgeRuntimeStep = {
  node: string;
  label: string;
  patch: Partial<InvalidEdgeCafeState>;
  stateAfter: InvalidEdgeCafeState;
};

export type InvalidEdgeRouteChosen = {
  fromNode: string;
  pickedKey: string;
  toNode: string;
  readField: string;
  readValue: string | null;
};

export function buildInvalidEdgeGraph(mode: InvalidEdgeMode) {
  // invalid-edge 模式故意把 pathMap 里的 "unknown" 删掉——路由函数返回 "unknown" 时
  // framework 找不到对应节点 → 抛「pathMap 里没有这个键」（接口级报错）。
  // as const 让 value 是字面量节点名，匹配 LangGraph addConditionalEdges 的类型签名。
  const pathMap = (mode === "invalid-edge"
    ? { hot: "brewHot", ice: "brewIce" }
    : { hot: "brewHot", ice: "brewIce", unknown: "reject" }) as Record<string, "brewHot" | "brewIce" | "reject">;

  return new StateGraph(InvalidEdgeStateAnnotation)
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
      (state: InvalidEdgeCafeState) => routeAfterClassify(state, mode, pathMap),
      pathMap,
    )
    .addEdge("brewHot", "serve")
    .addEdge("brewIce", "serve")
    .addEdge("serve", END)
    .addEdge("reject", END)
    .compile();
}

export async function runInvalidEdgeGraph(drinkName: string, mode: InvalidEdgeMode): Promise<{
  input: InvalidEdgeCafeState;
  runtime: InvalidEdgeRuntimeStep[];
  finalState: InvalidEdgeCafeState;
  routeChosen: InvalidEdgeRouteChosen | null;
}> {
  const graph = buildInvalidEdgeGraph(mode);
  const input: InvalidEdgeCafeState = {
    drinkName,
    orderSlip: null,
    drinkType: null,
    cupLabel: null,
    pickupCall: null,
    errorReason: null,
  };
  const runtime: InvalidEdgeRuntimeStep[] = [];
  let merged: InvalidEdgeCafeState = { ...input };
  const stream = await graph.stream(input, { streamMode: "updates" });
  for await (const chunk of stream) {
    const keys = Object.keys(chunk);
    for (const node of keys) {
      const patch = (chunk as Record<string, Partial<InvalidEdgeCafeState>>)[node] ?? {};
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
  // 计算 routeChosen
  const classifyIndex = runtime.findIndex((step) => step.node === "classifyDrink");
  let routeChosen: InvalidEdgeRouteChosen | null = null;
  if (classifyIndex >= 0 && classifyIndex + 1 < runtime.length) {
    const nextStep = runtime[classifyIndex + 1];
    const drinkType = merged.drinkType;
    const pathMap: Record<string, string> =
      mode === "invalid-edge"
        ? { hot: "brewHot", ice: "brewIce" }
        : { hot: "brewHot", ice: "brewIce", unknown: "reject" };
    const pickedKey = routeAfterClassify(merged, mode, pathMap);
    routeChosen = {
      fromNode: "classifyDrink",
      pickedKey,
      toNode: nextStep.node,
      readField: "drinkType",
      readValue: drinkType,
    };
  }
  return { input, runtime, finalState: merged, routeChosen };
}
