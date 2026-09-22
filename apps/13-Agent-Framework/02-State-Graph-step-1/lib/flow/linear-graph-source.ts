/**
 * 职责：给页面「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/linear-graph.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 */

export const STATE_CODE = `const CafeStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const TAKE_ORDER_CODE = `async function takeOrderNode(state: CafeState): Promise<Partial<CafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}`;

export const BREW_HOT_CODE = `async function brewHotNode(state: CafeState): Promise<Partial<CafeState>> {
  const drink = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: drink.cupLabel };
}`;

export const SERVE_CODE = `async function serveNode(state: CafeState): Promise<Partial<CafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}`;

export const BUILD_CODE = `const graph = new StateGraph(CafeStateAnnotation)
  .addNode("takeOrder", takeOrderNode)
  .addNode("brewHot", brewHotNode)
  .addNode("serve", serveNode)
  .addEdge(START, "takeOrder")
  .addEdge("takeOrder", "brewHot")
  .addEdge("brewHot", "serve")
  .addEdge("serve", END)
  .compile();`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码，
 * 不再从运行时拿 code 字段——展示代码和运行时数据彻底解耦。
 */
export const NODE_CODE_BY_NAME: Record<string, string> = {
  takeOrder: TAKE_ORDER_CODE,
  brewHot: BREW_HOT_CODE,
  serve: SERVE_CODE,
};