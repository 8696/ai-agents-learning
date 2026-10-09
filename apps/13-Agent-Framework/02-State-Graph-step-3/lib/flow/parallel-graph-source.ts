/**
 * 职责：给并行页「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/parallel-graph.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 *
 * 三种 mode 共享同一份节点代码字面量；差别只在「cupLabel 字段声明 + branchHot / branchIce patch 体」。
 */

export const STATE_CODE_NO_REDUCER = `const ParallelStateAnnotation = Annotation.Root({
  drinkName:   Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:    Annotation<string | null>({ reducer: lastWrite, default: () => null }),  // 默认 lastWrite
  hotCupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  iceCupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall:  Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const STATE_CODE_ARRAY_REDUCER = `function appendArray(left, right) {
  const base = Array.isArray(left) ? left : left ? [left] : [];
  return right ? [...base, right] : base;
}

const ParallelStateAnnotation = Annotation.Root({
  drinkName:   Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:    Annotation<string | string[] | null>({ reducer: appendArray, default: () => null }),  // 数组追加
  hotCupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  iceCupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall:  Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const STATE_CODE_DISTINCT = `const ParallelStateAnnotation = Annotation.Root({
  drinkName:   Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:    Annotation<string | null>({ reducer: lastWrite, default: () => null }),  // 这一支完全不用
  hotCupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),  // 热分支写这里
  iceCupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),  // 冰分支写这里
  pickupCall:  Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const TAKE_ORDER_CODE = `async function takeOrderNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}`;

export const BRANCH_HOT_NO_REDUCER_CODE = `async function branchHotNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  const hot = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: hot.cupLabel };   // 两个并行节点都写 cupLabel
}`;

export const BRANCH_HOT_ARRAY_CODE = `async function branchHotNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  const hot = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: hot.cupLabel };   // array-reducer 会把两个合并成 [冰，热]
}`;

export const BRANCH_HOT_DISTINCT_CODE = `async function branchHotNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  const hot = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { hotCupLabel: hot.cupLabel };   // 写到独立字段
}`;

export const BRANCH_ICE_NO_REDUCER_CODE = `async function branchIceNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  const ice = await brewIceDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: ice.cupLabel };
}`;

export const BRANCH_ICE_ARRAY_CODE = `async function branchIceNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  const ice = await brewIceDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: ice.cupLabel };
}`;

export const BRANCH_ICE_DISTINCT_CODE = `async function branchIceNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  const ice = await brewIceDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { iceCupLabel: ice.cupLabel };
}`;

export const SERVE_CODE = `async function serveNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  // 汇合点：从 cupLabel（或 hotCupLabel / iceCupLabel）拼一杯完整的取餐广播
  const label = state.cupLabel;
  const labelText = Array.isArray(label)
    ? label.join(" + ")
    : (label ?? (state.hotCupLabel + " + " + state.iceCupLabel));
  const notify = await notifyPickup({ orderSlip: state.orderSlip ?? "这单", cupLabel: labelText });
  return { pickupCall: notify.pickupCall };
}`;

export const PARALLEL_EDGES_CODE = `.addEdge(START, "takeOrder")
.addEdge("takeOrder", "branchHot")     // fan-out：同一节点出两条边
.addEdge("takeOrder", "branchIce")     // fan-out
.addEdge("branchHot", "serve")        // fan-in：两个分支都汇合到 serve
.addEdge("branchIce", "serve")        // fan-in
.addEdge("serve", END)`;

export const BUILD_CODE = `const graph = new StateGraph(ParallelStateAnnotation)
  .addNode("takeOrder", takeOrderNode)
  .addNode("branchHot", branchHotNode)
  .addNode("branchIce", branchIceNode)
  .addNode("serve", serveNode)
  .addEdge(START, "takeOrder")
  .addEdge("takeOrder", "branchHot")
  .addEdge("takeOrder", "branchIce")
  .addEdge("branchHot", "serve")
  .addEdge("branchIce", "serve")
  .addEdge("serve", END)
  .compile();`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码。
 * 不写 reducer 的代码：三个 mode 共用 takeOrder / serve 节点函数；branchHot / branchIce 各按 mode 选。
 */
export const NODE_CODE_BY_NAME: Record<string, string> = {
  takeOrder: TAKE_ORDER_CODE,
  serve: SERVE_CODE,
};
