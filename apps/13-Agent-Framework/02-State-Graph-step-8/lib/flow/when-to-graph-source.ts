/**
 * 职责：给「该不该上图」页「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/when-to-graph.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 */

export const STATE_CODE_WHEN_TO_GRAPH = `const WhenToGraphStateAnnotation = Annotation.Root({
  question:     Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode:         Annotation<WhenToGraphMode>({ reducer: lastWrite, default: () => "flat-single-node" as WhenToGraphMode }),
  answer:       Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  orderSlip:    Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:     Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall:   Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  stationsRun:  Annotation<number>({ reducer: lastWrite, default: () => 0 }),
});`;

export const ANSWER_DIRECT_CODE = `// 模式 flat-single-node：单节点直接给答案。
// 教学点——FAQ 根本不调任何工具。一次回话即可，不上图。
async function answerDirectNode(state: WhenToGraphState): Promise<Partial<WhenToGraphState>> {
  return {
    answer: ANSWER_OPEN_HOURS,
    stationsRun: 1,
  };
}`;

export const OVER_GRAPHED_CODE = `// 模式 over-graphed：FAQ 硬套完整进出图——三站全是浪费。
// 教学点：runtime 跑出三个 patch、orderSlip / cupLabel / pickupCall 三个字段被写了，但和「几点关门」毫无关系。
async function takeOrderWasteNode(state) {
  const order = await placeOrder({ drinkName: state.question });   // 用问题当下文表——无意义
  return { orderSlip: order.orderSlip, stationsRun: state.stationsRun + 1 };
}
async function brewHotWasteNode(state) {
  return { cupLabel: "热杯（写了也没用）", stationsRun: state.stationsRun + 1 };
}
async function serveWasteNode(state) {
  const notify = await notifyPickup({ orderSlip: state.orderSlip ?? "（客人没下单）", cupLabel: state.cupLabel ?? "" });
  return { pickupCall: \`\${notify.pickupCall}（跟营业时间无关）\`, stationsRun: state.stationsRun + 1 };
}`;

export const EDGES_FLAT = `// flat-single-node：START → answerDirect → END
.addEdge(START, "answerDirect")
.addEdge("answerDirect", END)`;

export const EDGES_OVER_GRAPHED = `// over-graphed：START → takeOrder → brewHot → serve → END
.addEdge(START, "takeOrder")
.addEdge("takeOrder", "brewHot")
.addEdge("brewHot", "serve")
.addEdge("serve", END)`;

export const JUDGMENT_RULE = `// 判断口诀（变体 J 教学点）
//
// **步骤能提前画出来 → 上图。**
// **下一步只有模型临场才知道 → 留给模块 07 那种循环。**
//
// 适用上图：
//   + 节点固定（点单 / 制作 / 出餐 / 扣卡 / 中断 / 收场）
//   + 边能事先画死（addEdge / addConditionalEdges）
//   + 状态字段已知（orderSlip / cupLabel / pickupCall）
//   + 不调模型也能交付（纯业务流）
//
// 不适用上图：
//   + 客人只问 FAQ（店几点关门 / Wi-Fi 密码 / 退换政策）→ 单节点直接答
//   + 下一步不可预测（用户想聊什么）→ 模块 07 模型自主循环
//   + 状态字段没有自然结构（一问一答就是终点）→ 上图 = 硬塞字段，浪费
//
// 反例：
//   + FAQ「店几点关门」硬套出杯图 → runtime 3 站写入 orderSlip / cupLabel / pickupCall，跟问题无关
//   + 用户自由问答「你都会啥」→ 上图塞不下任何节点，模块 07 循环更合适

// 反面话术（变体 J 容易踩）：
//   + 「反正都是 LangGraph，写什么都用图」——把"判断口诀"丢了
//   + 「状态图 = 任何工作流都用」——边界没守住
//   + 「章节越加 LLM 不行就用图」——图不一定能帮你

// 跟变体 E「非法转移」对照：
//   变体 E：图画了但路径映射没列 → 框架抛异常（接口级报错）
//   变体 J：图根本不该画 → runtime 浪费得不值得（结构级错误）`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码。
 */
export const NODE_CODE_BY_NAME_WHEN_TO_GRAPH: Record<string, string> = {
  answerDirect: ANSWER_DIRECT_CODE,
  takeOrder: OVER_GRAPHED_CODE,
  brewHot: OVER_GRAPHED_CODE,
  serve: OVER_GRAPHED_CODE,
};