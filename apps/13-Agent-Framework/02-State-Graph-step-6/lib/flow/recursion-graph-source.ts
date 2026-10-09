/**
 * 职责：给递归上限页「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/recursion-graph.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 */

export const STATE_CODE_RECURSION = `const RecursionStateAnnotation = Annotation.Root({
  drinkName:      Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode:           Annotation<RecursionMode>({ reducer: lastWrite, default: () => "well-behaved" as RecursionMode }),
  recursionLimit: Annotation<number>({ reducer: lastWrite, default: () => 5 }),
  orderSlip:      Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:       Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  retryCount:     Annotation<number>({ reducer: lastWrite, default: () => 0 }),
  stoppedReason:  Annotation<"ok" | "recursion_limit" | null>({ reducer: lastWrite, default: () => null }),
  pickupCall:     Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const TAKE_ORDER_CODE_RECURSION = `async function takeOrderNode(state: RecursionState): Promise<Partial<RecursionState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}`;

export const BREW_HOT_CODE_RECURSION = `async function brewHotNode(state: RecursionState): Promise<Partial<RecursionState>> {
  // 模拟「机器永远做坏」：cupLabel 一直 null；retryCount 每跑一次 +1。
  const nextCount = (state.retryCount ?? 0) + 1;
  return { retryCount: nextCount, cupLabel: null };
}`;

export const SERVE_CODE_RECURSION = `async function serveNode(state: RecursionState): Promise<Partial<RecursionState>> {
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  return { pickupCall: notify.pickupCall };
}`;

/**
 * 三个 mode 路由函数对比——这是本页教学点。
 *
 * well-behaved  │ cupLabel === null && retryCount < 3 → "retry"；否则 "ok"
 * always-broken│ cupLabel === null                  → "retry"（**忘写 retryCount 上限**）
 * graceful     │ 同 always-broken（外层 invoke 用 try/catch 体面收场）
 */
export const ROUTE_WELL_BEHAVED = `function routeAfterBrew(state: RecursionState): "retry" | "ok" {
  if (state.cupLabel === null && (state.retryCount ?? 0) < 3) return "retry";
  return "ok";
}`;

export const ROUTE_BROKEN = `function routeAfterBrew(state: RecursionState): "retry" | "ok" {
  if (state.cupLabel === null) return "retry";   // 忘了写 retryCount < 3 上限
  return "ok";
}`;

export const PATH_MAP_RECURSION = `// 路径映射：路由返回 "retry" → brewHot；返回 "ok" → serve。
{ retry: "brewHot", ok: "serve" }`;

export const GRACEFUL_TRY_CATCH = `// layer-1：外层 invoke 用 try/catch 捕获 GraphRecursionError。
async function invokeRecursionGraph(input): Promise<RecursionInvokeResult> {
  const runtime: RuntimeStep[] = [];
  let merged: RecursionState = makeInitial(input);
  const graph = buildRecursionGraph(input.mode, input.recursionLimit);

  // stream 模式一边跑一边记录 runtime；抛错时 runtime 仍保留抛错前跑过的站。
  try {
    for await (const chunk of await graph.stream(input, { streamMode: "updates" })) {
      for (const node of Object.keys(chunk)) {
        const patch = chunk[node] ?? {};
        merged = { ...merged, ...patch };
        runtime.push({ node, label: NODE_LABELS[node] ?? node, patch, stateAfter: { ...merged } });
      }
    }
    return { status: "completed", finalState: merged, runtime };
  } catch (e) {
    if (isGraphRecursionError(e)) {
      if (input.mode === "always-broken") throw e;     // 不兜底 → 框架抛错
      return {                                          // graceful 模式：体面收场
        status: "recursion_limit",
        stoppedReason: "recursion_limit",
        finalState: { ...merged, stoppedReason: "recursion_limit" },
        runtime,
        errorMessage: e instanceof Error ? e.message : String(e),
      };
    }
    throw e;
  }
}`;

export const COMPILE_RECUSION_LIMIT = `// recursionLimit 在 langgraph 1.x 里是 stream/invoke 的运行时配置，不是 compile 入参。
// compile() 不带 recursionLimit——它只接受 checkpointer / interruptBefore/After / name / description / transformers。
const graph = new StateGraph(...)
  .addNode("takeOrder", takeOrderNode)
  .addNode("brewHot", brewHotNode)
  .addNode("serve", serveNode)
  .addEdge(START, "takeOrder")
  .addEdge("takeOrder", "brewHot")
  .addConditionalEdges("brewHot", routeAfterBrew, { retry: "brewHot", ok: "serve" })
  .addEdge("serve", END)
  .compile();

// recursionLimit 在 stream 调用里传：
graph.stream(
  { drinkName, mode },
  { streamMode: "updates", recursionLimit: 5 }   // ← 这一步关键：上限 5
);`;

export const MODULE_07_DIFF = `// 模块 07 手写循环的 maxRounds 数的是「模型调了几轮」；stoppedReason 自己写。
// 状态图的 recursionLimit 数的是「走了几个超级步」；不写就是抛 GraphRecursionError。
//
// 关键差别：超级步 ≠ 模型轮次。
//   - 一步里有多个并行节点 = 1 个超级步（但不计模型调用）
//   - step-2 那张 brewHot → brewHot 回边每走一次是 1 个超级步、**没有调模型**
//   - 模块 07 的 round 算的是「向模型发了第几次请求」
//
// 模块 07（手写）：
//   while (round < maxRounds) {
//     const result = await callModel(state);
//     round += 1;
//     if (result.finalAnswer) { stoppedReason = "final_answer"; break; }
//   }
//   if (round >= maxRounds) stoppedReason = "max_rounds";
//
// 状态图：
//   graph.stream(input, { streamMode: "updates", recursionLimit: 5 });
//   每走一个超级步 = +1；
//   超了 recursionLimit → 抛 GraphRecursionError；
//   要体面收场就外层 try/catch 写 stoppedReason = "recursion_limit"。`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码。
 */
export const NODE_CODE_BY_NAME_RECURSION: Record<string, string> = {
  takeOrder: TAKE_ORDER_CODE_RECURSION,
  brewHot: BREW_HOT_CODE_RECURSION,
  serve: SERVE_CODE_RECURSION,
};