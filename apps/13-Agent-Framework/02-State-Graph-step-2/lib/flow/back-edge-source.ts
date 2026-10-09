/**
 * 职责：给回边页「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/back-edge.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 */

export const STATE_CODE_BACK_EDGE = `const BackEdgeStateAnnotation = Annotation.Root({
  drinkName:   Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode:        Annotation<"smooth" | "retry-once" | "fail">({ reducer: lastWrite, default: () => "smooth" }),
  orderSlip:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  retryCount:  Annotation<number | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:    Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall:  Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  errorReason: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const TAKE_ORDER_CODE_BACK_EDGE = `async function takeOrderNode(state: BackEdgeCafeState): Promise<Partial<BackEdgeCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}`;

export const BREW_HOT_CODE_BACK_EDGE = `async function brewHotNode(state: BackEdgeCafeState): Promise<Partial<BackEdgeCafeState>> {
  const nextCount = (state.retryCount ?? 0) + 1;
  let cupLabel;
  if (state.mode === "smooth") {
    cupLabel = \`热杯。杯盖写着「\${state.orderSlip ?? ""}」。第 \${nextCount} 次出杯。\`;
  } else if (state.mode === "retry-once") {
    cupLabel = nextCount >= 2 ? \`热杯。杯盖写着「\${state.orderSlip ?? ""}」。第 \${nextCount} 次重做出杯。\` : null;
  } else {
    cupLabel = null;   // mode === "fail"
  }
  return { retryCount: nextCount, cupLabel };
}`;

export const SERVE_CODE_BACK_EDGE = `async function serveNode(state: BackEdgeCafeState): Promise<Partial<BackEdgeCafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}`;

export const REJECT_CODE_BACK_EDGE = `async function rejectNode(state: BackEdgeCafeState): Promise<Partial<BackEdgeCafeState>> {
  return {
    pickupCall: \`「\${state.drinkName}」重做 \${state.retryCount ?? 0} 次仍空杯，无法出杯。\`,
    errorReason: \`cupLabel 仍为空，retryCount = \${state.retryCount ?? 0}，超过上限 3；走 reject。\`,
  };
}`;

export const ROUTE_CODE_BACK_EDGE = `function routeAfterBrew(state: BackEdgeCafeState): "success" | "retry" | "exceeded" {
  if (state.cupLabel) return "success";                          // 出杯 → 出餐
  if ((state.retryCount ?? 0) < 3) return "retry";              // 还能重做 → 回 brewHot
  return "exceeded";                                            // 超过 3 次 → 无法制作
}

const PATH_MAP = { success: "serve", retry: "brewHot", exceeded: "reject" };`;

export const BACK_EDGE_EDGES_CODE = `.addEdge(START, "takeOrder")
.addEdge("takeOrder", "brewHot")
.addConditionalEdges(
  "brewHot",
  routeAfterBrew,
  { success: "serve", retry: "brewHot", exceeded: "reject" },   // 回边：retry → brewHot（自己）
)
.addEdge("serve", END)
.addEdge("reject", END)`;

export const BUILD_CODE_BACK_EDGE = `const graph = new StateGraph(BackEdgeStateAnnotation)
  .addNode("takeOrder", takeOrderNode)
  .addNode("brewHot", brewHotNode)
  .addNode("serve", serveNode)
  .addNode("reject", rejectNode)
  .addEdge(START, "takeOrder")
  .addEdge("takeOrder", "brewHot")
  .addConditionalEdges("brewHot", routeAfterBrew, { success: "serve", retry: "brewHot", exceeded: "reject" })
  .addEdge("serve", END)
  .addEdge("reject", END)
  .compile();`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码，
 * 不再从运行时拿 code 字段——展示代码和运行时数据彻底解耦。
 */
export const NODE_CODE_BY_NAME_BACK_EDGE: Record<string, string> = {
  takeOrder: TAKE_ORDER_CODE_BACK_EDGE,
  brewHot: BREW_HOT_CODE_BACK_EDGE,
  serve: SERVE_CODE_BACK_EDGE,
  reject: REJECT_CODE_BACK_EDGE,
};
