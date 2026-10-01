/**
 * 职责：给条件分流页「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/conditional-graph.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 */

export const STATE_CODE_CONDITIONAL = `const ConditionalStateAnnotation = Annotation.Root({
  drinkName:    Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip:    Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  drinkType:    Annotation<"hot" | "ice" | "unknown" | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:     Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  errorReason:  Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const TAKE_ORDER_CODE_CONDITIONAL = `async function takeOrderNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}`;

export const CLASSIFY_CODE = `async function classifyDrinkNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const result = await classifyDrink({ drinkName: state.orderSlip ?? state.drinkName });
  return { drinkType: result.drinkType };   // hot | ice | unknown
}`;

export const BREW_HOT_CODE_CONDITIONAL = `async function brewHotNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const drink = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: drink.cupLabel };
}`;

export const BREW_ICE_CODE = `async function brewIceNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const drink = await brewIceDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: drink.cupLabel };
}`;

export const SERVE_CODE_CONDITIONAL = `async function serveNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}`;

export const REJECT_CODE = `async function rejectNode(state: ConditionalCafeState): Promise<Partial<ConditionalCafeState>> {
  return {
    pickupCall: "菜单上没有「" + (state.drinkName || "") + "」。",
    errorReason: "分类结果 drinkType = unknown，对应路径映射里的 reject 节点。",
  };
}`;

export const ROUTE_CODE = `function routeAfterClassify(state: ConditionalCafeState): "hot" | "ice" | "unknown" {
  return state.drinkType ?? "unknown";   // 路由函数读 state.drinkType，返回键
}

const PATH_MAP = { hot: "brewHot", ice: "brewIce", unknown: "reject" };`;

export const CONDITIONAL_EDGES_CODE = `.addEdge(START, "takeOrder")
.addEdge("takeOrder", "classifyDrink")
.addConditionalEdges(
  "classifyDrink",
  routeAfterClassify,
  { hot: "brewHot", ice: "brewIce", unknown: "reject" },
)
.addEdge("brewHot", "serve")
.addEdge("brewIce", "serve")
.addEdge("serve", END)
.addEdge("reject", END)`;

export const BUILD_CODE_CONDITIONAL = `const graph = new StateGraph(ConditionalStateAnnotation)
  .addNode("takeOrder", takeOrderNode)
  .addNode("classifyDrink", classifyDrinkNode)
  .addNode("brewHot", brewHotNode)
  .addNode("brewIce", brewIceNode)
  .addNode("serve", serveNode)
  .addNode("reject", rejectNode)
  .addEdge(START, "takeOrder")
  .addEdge("takeOrder", "classifyDrink")
  .addConditionalEdges("classifyDrink", routeAfterClassify, { hot: "brewHot", ice: "brewIce", unknown: "reject" })
  .addEdge("brewHot", "serve")
  .addEdge("brewIce", "serve")
  .addEdge("serve", END)
  .addEdge("reject", END)
  .compile();`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码，
 * 不再从运行时拿 code 字段——展示代码和运行时数据彻底解耦。
 */
export const NODE_CODE_BY_NAME_CONDITIONAL: Record<string, string> = {
  takeOrder: TAKE_ORDER_CODE_CONDITIONAL,
  classifyDrink: CLASSIFY_CODE,
  brewHot: BREW_HOT_CODE_CONDITIONAL,
  brewIce: BREW_ICE_CODE,
  serve: SERVE_CODE_CONDITIONAL,
  reject: REJECT_CODE,
};
