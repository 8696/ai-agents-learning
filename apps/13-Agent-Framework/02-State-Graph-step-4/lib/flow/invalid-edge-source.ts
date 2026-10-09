/**
 * 职责：给非法转移页「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/invalid-edge.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 *
 * 三个 mode 共享同一份节点代码字面量；差别只在「pathMap」+「路由函数」。
 */

export const STATE_CODE_INVALID_EDGE = `const InvalidEdgeStateAnnotation = Annotation.Root({
  drinkName:  Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip:  Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  drinkType:  Annotation<"hot" | "ice" | "unknown" | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  errorReason: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const TAKE_ORDER_CODE_INVALID_EDGE = `async function takeOrderNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}`;

export const CLASSIFY_CODE_INVALID_EDGE = `async function classifyDrinkNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const result = await classifyDrink({ drinkName: state.drinkName });
  return { drinkType: result.drinkType };   // hot | ice | unknown
}`;

export const BREW_HOT_CODE_INVALID_EDGE = `async function brewHotNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const hot = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: hot.cupLabel };
}`;

export const BREW_ICE_CODE_INVALID_EDGE = `async function brewIceNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const ice = await brewIceDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: ice.cupLabel };
}`;

export const SERVE_CODE_INVALID_EDGE = `async function serveNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}`;

export const REJECT_CODE_INVALID_EDGE = `async function rejectNode(state: InvalidEdgeCafeState): Promise<Partial<InvalidEdgeCafeState>> {
  return {
    pickupCall: \`「\${state.drinkName}」菜单上没有，请重新点单。\`,
    errorReason: \`drinkType = \${state.drinkType ?? "null"}（不识别）；走进 reject 终止站。\`,
  };
}`;

/** normal 模式：pathMap 完整（含 unknown） */
export const ROUTE_CODE_NORMAL = `function routeAfterClassify(state: InvalidEdgeCafeState): "hot" | "ice" | "unknown" {
  return state.drinkType ?? "unknown";   // 路由函数读 state.drinkType，返回键
}

const PATH_MAP = { hot: "brewHot", ice: "brewIce", unknown: "reject" };`;

/** invalid-edge 模式：pathMap 故意缺 unknown——路由返回 "unknown" 时 framework 抛「pathMap 里没有这个键」 */
export const ROUTE_CODE_INVALID = `function routeAfterClassify(state: InvalidEdgeCafeState): "hot" | "ice" | "unknown" {
  return state.drinkType ?? "unknown";
}

const PATH_MAP = { hot: "brewHot", ice: "brewIce" };   // 缺 "unknown"——路由返回未声明键就抛异常`;

export const ROUTE_CODE_FALLBACK = `function routeAfterClassify(state: InvalidEdgeCafeState): string {
  const dt = state.drinkType ?? "unknown";
  return dt in PATH_MAP ? dt : "reject";   // 兜底：未识别 drinkType 返回 reject
}

const PATH_MAP = { hot: "brewHot", ice: "brewIce", unknown: "reject", reject: "reject" };`;

export const INVALID_EDGES_CODE = `.addEdge(START, "takeOrder")
.addEdge("takeOrder", "classifyDrink")
.addConditionalEdges(
  "classifyDrink",
  routeAfterClassify,
  PATH_MAP,   // 三个 mode 这一行不同：normal / fallback 含 reject，invalid-edge 缺
)
.addEdge("brewHot", "serve")
.addEdge("brewIce", "serve")
.addEdge("serve", END)
.addEdge("reject", END)`;

export const BUILD_CODE_INVALID_EDGE = `const graph = new StateGraph(InvalidEdgeStateAnnotation)
  .addNode("takeOrder", takeOrderNode)
  .addNode("classifyDrink", classifyDrinkNode)
  .addNode("brewHot", brewHotNode)
  .addNode("brewIce", brewIceNode)
  .addNode("serve", serveNode)
  .addNode("reject", rejectNode)
  .addEdge(START, "takeOrder")
  .addEdge("takeOrder", "classifyDrink")
  .addConditionalEdges("classifyDrink", routeAfterClassify, PATH_MAP)
  .addEdge("brewHot", "serve")
  .addEdge("brewIce", "serve")
  .addEdge("serve", END)
  .addEdge("reject", END)
  .compile();`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码。
 * 三个 mode 共享同一份节点函数；差别只在 pathMap / 路由函数。
 */
export const NODE_CODE_BY_NAME_INVALID_EDGE: Record<string, string> = {
  takeOrder: TAKE_ORDER_CODE_INVALID_EDGE,
  classifyDrink: CLASSIFY_CODE_INVALID_EDGE,
  brewHot: BREW_HOT_CODE_INVALID_EDGE,
  brewIce: BREW_ICE_CODE_INVALID_EDGE,
  serve: SERVE_CODE_INVALID_EDGE,
  reject: REJECT_CODE_INVALID_EDGE,
};
