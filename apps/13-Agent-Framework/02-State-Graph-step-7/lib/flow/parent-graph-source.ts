/**
 * 职责：给主子图页「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/parent-graph.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 */

export const STATE_CODE_PARENT = `const ParentStateAnnotation = Annotation.Root({
  drinkName:  Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode:       Annotation<SubgraphMode>({ reducer: lastWrite, default: () => "flat" as SubgraphMode }),
  orderSlip:  Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  retryCount: Annotation<number>({ reducer: lastWrite, default: () => 0 }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const SUBGRAPH_STATE_SAME = `// 子图 A（与父图同名字段）：orderSlip / cupLabel / retryCount
const SubgraphSameAnnotation = Annotation.Root({
  orderSlip:  Annotation<string>({ reducer: lastWrite, default: () => "" }),
  cupLabel:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  retryCount: Annotation<number>({ reducer: lastWrite, default: () => 0 }),
});`;

export const SUBGRAPH_STATE_RENAMED = `// 子图 B（与父图不同名字段）：drinkSlip / label / retries
const SubgraphRenamedAnnotation = Annotation.Root({
  drinkSlip:  Annotation<string>({ reducer: lastWrite, default: () => "" }),
  label:      Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  retries:    Annotation<number>({ reducer: lastWrite, default: () => 0 }),
});`;

export const TAKE_ORDER_CODE_PARENT = `async function takeOrderNode(state: ParentCafeState): Promise<Partial<ParentCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}`;

export const MAKE_DRINK_FLAT_CODE = `// 模式 flat：makeDrink 是普通节点函数。代码和子图内 brewHot 等价，但不抽成子图。
async function makeDrinkFlatNode(state: ParentCafeState): Promise<Partial<ParentCafeState>> {
  const nextCount = (state.retryCount ?? 0) + 1;
  const cupLabel = \`热杯（flat 模式 brewHot 写出「\${state.orderSlip ?? ""}」\`;
  return { retryCount: nextCount, cupLabel };
}`;

export const MAKE_DRINK_SUBGRAPH_SAME = `// 模式 subgraph-same-fields：父图 addNode("makeDrink", subgraph) 直接挂子图。
// **教学点**：同名字段（orderSlip / cupLabel / retryCount）自动传。无需 wrapper。
const subgraphSame = buildSubgraphBrewSameFields();
parentGraph.addNode("makeDrink", subgraphSame);   // ← 这一行就完事

// 等价于把 subgraphSame 当成普通节点函数挂上；只是它本身是一整张编译好的图。
// addNode 内部走的是 RunnableLike 接口，CompiledStateGraph 实现了 Runnable。`;

export const MAKE_DRINK_SUBGRAPH_RENAMED = `// 模式 subgraph-renamed：父图 addNode("makeDrink", wrapper) 挂 wrapper 节点。
// **教学点**：不同名字段不会自动传；wrapper 必须手动 invoke 子图并翻译字段。
async function makeDrinkRenamedWrapper(state: ParentCafeState): Promise<Partial<ParentCafeState>> {
  const subRenamed = buildSubgraphBrewRenamed();
  const subResult = await subRenamed.invoke({ drinkSlip: state.orderSlip ?? "" });   // 父 → 子
  return {
    cupLabel: subResult.label ?? null,                                                // 子 → 父
    retryCount: subResult.retries,
  };
}
parentGraph.addNode("makeDrink", makeDrinkRenamedWrapper);`;

export const SERVE_CODE_PARENT = `async function serveNode(state: ParentCafeState): Promise<Partial<ParentCafeState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}`;

export const SUBGRAPH_BREW_HOT_NODE = `// 子图内 brewHot 节点：subgraph-same-fields 和 subgraph-renamed 共用这一段逻辑，
// 只是状态字段名不同（子图 A 用 orderSlip，子图 B 用 drinkSlip）。
async function subgraphBrewHotNode(state): Promise<...> {
  const nextCount = (state.retryCount ?? state.retries ?? 0) + 1;
  const cupLabel = \`热杯（子图内 brewHot 写出「\${state.orderSlip ?? state.drinkSlip ?? ""}」\`;
  return {
    [sameFields ? "cupLabel" : "label"]: cupLabel,
    [sameFields ? "retryCount" : "retries"]: nextCount,
  };
}`;

export const EDGES_PARENT = `// 父图：START → takeOrder → makeDrink → serve → END
.addEdge(START, "takeOrder")
.addEdge("takeOrder", "makeDrink")
.addEdge("makeDrink", "serve")
.addEdge("serve", END)`;

export const EDGES_SUBGRAPH = `// 子图（makeDrink 内部）：subStart → subBrewHot → subEnd
//               注意子图自己的 START / END——不是父图的 START / END。
.addEdge(START, "subBrewHot")
.addEdge("subBrewHot", END)`;

export const WHEN_TO_SUBGRAPH = `// 什么时候才值得抽子图？
//
// 抽出来：分两图（更复杂）
//   + 子图被多张父图复用（每张父图都 addNode 进 compact 代码里）
//   + 子图自己有一份独立的状态机（重做 / 失败回退 / 多状态），不想在父图里 if 满天飞
//
// 不抽：单图（更简单）
//   + makeDrink 只在这一张父图里用一次
//   + makeDrink 没有自己的多状态——一次做完就走
//
// 反例（变体 J）：客人只问「店几点关门」，根本不调任何工具。硬套子图 = 用 Redux 管一个开关——更重，不更清。
//
// 判断口诀（和模块 07 比）：**能用一张 flat 图画清的就别抽子图**。子图的价值在「复用」和「边界」，不在「嵌套」。`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码。
 */
export const NODE_CODE_BY_NAME_PARENT = {
  takeOrder: TAKE_ORDER_CODE_PARENT,
  makeDrink: MAKE_DRINK_FLAT_CODE,  // 三种模式 runtime 都查 makeDrink，页面会按 mode 替换
  serve: SERVE_CODE_PARENT,
};

export function makeDrinkCodeByMode(mode: "flat" | "subgraph-same-fields" | "subgraph-renamed"): string {
  if (mode === "flat") return MAKE_DRINK_FLAT_CODE;
  if (mode === "subgraph-same-fields") return MAKE_DRINK_SUBGRAPH_SAME;
  return MAKE_DRINK_SUBGRAPH_RENAMED;
}