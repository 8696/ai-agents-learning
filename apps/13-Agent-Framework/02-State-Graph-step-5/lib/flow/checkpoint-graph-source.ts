/**
 * 职责：给检查点 + 中断页「画路 · 图还没跑，源代码在这里」用的代码字符串字面量。
 * 数据流：声明期源代码字面量、运行时节点源代码字面量，按节点名映射一份查找表给前端。
 * 为什么单独成文件：和 lib/flow/checkpoint-graph.ts 在物理上拆开——给页面渲染的字符串归这里管，运行时归那里管，互不依赖。
 */

export const STATE_CODE_CHECKPOINT = `const CheckpointStateAnnotation = Annotation.Root({
  drinkName:       Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip:       Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  chargeConfirmed: Annotation<boolean | null>({ reducer: lastWrite, default: () => null }),
  chargeResult:    Annotation<{ ok: boolean; transactionId?: string; error?: string } | null>({ reducer: lastWrite, default: () => null }),
  cupLabel:        Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall:      Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export const TAKE_ORDER_CODE_CHECKPOINT = `async function takeOrderNode(state: CheckpointCafeState): Promise<Partial<CheckpointCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}`;

export const CHARGE_REQUEST_CODE = `async function chargeRequestNode(state: CheckpointCafeState, mode: CheckpointMode): Promise<Partial<CheckpointCafeState>> {
  if (mode === "memory-saver-interrupt") {
    const confirmed = interrupt("店长确认扣卡？") as boolean;   // 第一次 invoke 暂停；第二次带 Command({ resume }) 拿到这个值
    return { chargeConfirmed: confirmed };
  }
  return { chargeConfirmed: true };   // 其它模式直接 confirm
}`;

export const CHARGE_MEMBER_CARD_CODE = `async function chargeMemberCardNode(state: CheckpointCafeState): Promise<Partial<CheckpointCafeState>> {
  const result = await chargeMemberCard({
    memberId: "M-A07",
    amount: 3500,
    idempotencyKey: state.orderSlip ?? "no-order",
  });
  return { chargeResult: result };
}`;

export const BREW_HOT_CODE_CHECKPOINT = `async function brewHotNode(state: CheckpointCafeState): Promise<Partial<CheckpointCafeState>> {
  const hot = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: hot.cupLabel };
}`;

export const SERVE_CODE_CHECKPOINT = `async function serveNode(state: CheckpointCafeState): Promise<Partial<CheckpointCafeState>> {
  const ok = state.chargeResult && state.chargeResult.ok;
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: ok ? state.cupLabel ?? "（杯盖还是空的）" : \`扣卡失败：\${state.chargeResult?.error ?? "未知错误"}\`,
  });
  return { pickupCall: notify.pickupCall };
}`;

export const CHECKPOINT_BUILD_NO = `// 模式 1：不传 checkpointer
const graph = new StateGraph(CheckpointStateAnnotation)
  .addNode("takeOrder", takeOrderNode)
  .addNode("chargeRequest", (s) => chargeRequestNode(s, "no-checkpoint"))
  .addNode("chargeMemberCard", chargeMemberCardNode)
  .addNode("brewHot", brewHotNode)
  .addNode("serve", serveNode)
  .addEdge(START, "takeOrder")
  .addEdge("takeOrder", "chargeRequest")
  .addEdge("chargeRequest", "chargeMemberCard")
  .addEdge("chargeMemberCard", "brewHot")
  .addEdge("brewHot", "serve")
  .addEdge("serve", END)
  .compile();   // 无 checkpointer`;

export const CHECKPOINT_BUILD_YES = `// 模式 2 / 3：传 MemorySaver
import { MemorySaver } from "@langchain/langgraph-checkpoint";
const checkpointer = new MemorySaver();   // 同一进程内全局共享——跨请求同 thread_id 恢复

const graph = new StateGraph(...)
  .compile({ checkpointer });

// 第一次调用：
const result = await graph.invoke(
  { drinkName, mode: "memory-saver-interrupt" },
  { configurable: { thread_id: "A07" } }   // 写快照
);
// result 含 __interrupt__ 字段 → 服务端返 { status: "interrupted" }

// 第二次调用（同 thread_id）：
const resumed = await graph.invoke(
  new Command({ resume: true }),   // resume 值进入 interrupt() 的返回值
  { configurable: { thread_id: "A07" } }   // 读快照，从 chargeRequest 继续
);`;

export const INTERRUPT_USAGE_CODE = `// 节点里调 interrupt(value) 暂停图 + 写快照
async function chargeRequestNode(state, mode) {
  if (mode === "memory-saver-interrupt") {
    const confirmed = interrupt("店长确认扣卡？") as boolean;
    return { chargeConfirmed: confirmed };
  }
  return { chargeConfirmed: true };
}

// 第二次 invoke 时用 Command({ resume }) 传值
graph.invoke(new Command({ resume: true }), config);
// interrupt() 调用此时返回 true（resume 值），节点继续执行

// 教学点：恢复时节点会从头重跑——chargeRequest 重新执行
// 但 interrupt 之前那段代码会重复执行；chargeMemberCard 节点的 idempotencyKey 拦截重复扣卡`;

export const IDEMPOTENT_CODE = `// lib/tools/member-card.ts：进程内 Map 模拟持久化层
const CHARGED_KEYS = new Set<string>();

export async function chargeMemberCard(input) {
  if (CHARGED_KEYS.has(input.idempotencyKey)) {
    return { ok: false, error: "idempotency_key 已扣过，不重复扣卡。" };
  }
  CHARGED_KEYS.add(input.idempotencyKey);
  return { ok: true, transactionId: \`TX-\${input.idempotencyKey}\` };
}`;

/**
 * 节点名 → 节点函数源代码。前端 runtime 卡按 node 名从这里查源代码。
 */
export const NODE_CODE_BY_NAME_CHECKPOINT: Record<string, string> = {
  takeOrder: TAKE_ORDER_CODE_CHECKPOINT,
  chargeRequest: CHARGE_REQUEST_CODE,
  chargeMemberCard: CHARGE_MEMBER_CARD_CODE,
  brewHot: BREW_HOT_CODE_CHECKPOINT,
  serve: SERVE_CODE_CHECKPOINT,
};
