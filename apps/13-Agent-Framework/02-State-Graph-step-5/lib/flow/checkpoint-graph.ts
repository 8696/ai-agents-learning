/**
 * 职责：装配带检查点 + 中断的状态图（变体 F + G）。
 *
 * 形状：START → takeOrder → chargeRequest（按 mode 决定是否 interrupt）→ chargeMemberCard → brewHot → serve → END
 *
 * 三个 mode 演示：
 *   no-checkpoint          不传 checkpointer → 每次 invoke 是独立运行，跨请求不能恢复
 *   memory-saver           LangGraph MemorySaver（同进程能跨请求恢复，杀进程即丢）
 *   memory-saver-interrupt MemorySaver + interrupt → 第一次 invoke 触发中断，第二次带 Command({ resume }) 继续
 *
 * 数据流：drinkName + mode + threadId + (可选 resume) → buildCheckpointGraph → graph.invoke(...)
 *       → 根据是否触发 interrupt 返回不同 status：completed / interrupted / resumed。
 *
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 */
import { Annotation, Command, END, interrupt, START, StateGraph } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { chargeMemberCard } from "../tools/member-card.js";
import {
  brewHotDrink,
  notifyPickup,
  placeOrder,
} from "../tools/cafe-tools.js";

export const DEFAULT_DRINK_CHECKPOINT = "来一杯中杯热拿铁。";
export const DEFAULT_THREAD_ID = "A07";

export type CheckpointMode = "no-checkpoint" | "memory-saver" | "memory-saver-interrupt";

export type CheckpointCafeState = {
  drinkName: string;
  mode: CheckpointMode;
  orderSlip: string | null;
  /** chargeRequest 节点写 true / false；interrupt 模式下由 resume 值决定 */
  chargeConfirmed: boolean | null;
  chargeResult: { ok: boolean; transactionId?: string; error?: string } | null;
  cupLabel: string | null;
  pickupCall: string | null;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

const CheckpointStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode: Annotation<CheckpointMode>({ reducer: lastWrite, default: () => "no-checkpoint" as CheckpointMode }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  chargeConfirmed: Annotation<boolean | null>({ reducer: lastWrite, default: () => null }),
  chargeResult: Annotation<{ ok: boolean; transactionId?: string; error?: string } | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});

export async function takeOrderNode(state: CheckpointCafeState): Promise<Partial<CheckpointCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}

/**
 * chargeRequest 节点：按 mode 决定是否触发 interrupt。
 *   no-checkpoint + memory-saver → 直接 confirm=true（不中断）
 *   memory-saver-interrupt       → 调 interrupt()，用户前端点确认 / 取消
 *
 * 注：LangGraph 1.4.16 的 mapCommand 用 `if (cmd.resume)` 真值判断，`Command({ resume: false })` 被吞。
 * 修法：resume 传 object `{ confirm: false }`（truthy 走 object 分支）。
 */
export async function chargeRequestNode(state: CheckpointCafeState, mode: CheckpointMode): Promise<Partial<CheckpointCafeState>> {
  if (mode === "memory-saver-interrupt") {
    const resumeValue = interrupt("店长确认扣卡？") as { confirm: boolean } | boolean;
    const isConfirm = typeof resumeValue === "object" && resumeValue !== null ? Boolean(resumeValue.confirm) : Boolean(resumeValue);
    return { chargeConfirmed: isConfirm };
  }
  return { chargeConfirmed: true };
}

/**
 * chargeMemberCard 节点：用 idempotencyKey 防重扣。
 * 检查点恢复时节点会重跑——interrupt 之前的代码会重复执行；这里靠 idempotencyKey 拦截重复扣。
 * 取消模式（chargeConfirmed=false）：不调真实扣卡工具，直接写「用户取消」结果——避免扣卡被执行。
 */
export async function chargeMemberCardNode(state: CheckpointCafeState): Promise<Partial<CheckpointCafeState>> {
  if (state.chargeConfirmed === false) {
    // 用户取消：跳过真实扣卡，但节点仍写 chargeResult（runtime 卡能展示这一站）
    return { chargeResult: { ok: false, error: "用户取消扣卡" } };
  }
  const result = await chargeMemberCard({
    memberId: "M-A07",
    amount: 3500,
    idempotencyKey: state.orderSlip ?? "no-order",
  });
  return { chargeResult: result };
}

export async function brewHotNode(state: CheckpointCafeState): Promise<Partial<CheckpointCafeState>> {
  const hot = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
  return { cupLabel: hot.cupLabel };
}

export async function serveNode(state: CheckpointCafeState): Promise<Partial<CheckpointCafeState>> {
  // 扣卡失败时仍广播但提示失败
  const ok = state.chargeResult && state.chargeResult.ok;
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: ok ? state.cupLabel ?? "（杯盖还是空的）" : `扣卡失败：${state.chargeResult?.error ?? "未知错误"}`,
  });
  return { pickupCall: notify.pickupCall };
}

const NODE_LABELS: Record<string, string> = {
  takeOrder: "点单",
  chargeRequest: "扣卡请求（interrupt 候选）",
  chargeMemberCard: "扣会员卡（幂等）",
  brewHot: "热饮制作",
  serve: "出餐",
};

export function buildCheckpointGraph(mode: CheckpointMode) {
  // 三个 mode 都用同一张图；差别只在「是否传 checkpointer」+「chargeRequest 节点行为」（节点行为在 chargeRequestNode 内部按 mode 分流）。
  const checkpointer = mode === "no-checkpoint" ? undefined : new MemorySaver();
  return new StateGraph(CheckpointStateAnnotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("chargeRequest", (state: CheckpointCafeState) => chargeRequestNode(state, mode))
    .addNode("chargeMemberCard", chargeMemberCardNode)
    .addNode("brewHot", brewHotNode)
    .addNode("serve", serveNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "chargeRequest")
    .addEdge("chargeRequest", "chargeMemberCard")
    .addEdge("chargeMemberCard", "brewHot")
    .addEdge("brewHot", "serve")
    .addEdge("serve", END)
    .compile({ checkpointer });
}

export type CheckpointRuntimeStep = {
  node: string;
  label: string;
  patch: Partial<CheckpointCafeState>;
  stateAfter: CheckpointCafeState;
};

export type CheckpointInvokeResult = {
  status: "completed" | "interrupted" | "resumed";
  /** interrupted 时存 interrupt 描述（"店长确认扣卡？"）；completed / resumed 时存 finalState */
  interruptValue?: string;
  finalState?: CheckpointCafeState;
  runtime?: CheckpointRuntimeStep[];
  threadId: string;
  mode: CheckpointMode;
  /** 完整 checkpoints list（用于页面展示「检查点已写」状态） */
  checkpointCount?: number;
};

/** 第一次或第二次调用都走这里。resume=true / false / { confirm: boolean } 走 Command({ resume }) 路径。 */
export async function invokeCheckpointGraph(input: {
  drinkName: string;
  mode: CheckpointMode;
  threadId: string;
  resume?: boolean | { confirm: boolean };
}): Promise<CheckpointInvokeResult> {
  const { drinkName, mode, threadId, resume } = input;
  const config = { configurable: { thread_id: threadId } };
  // 每次都新建 graph（不同 mode）+ 同一 MemorySaver（保证 thread_id 状态延续）
  // MemorySaver 实例必须是同一个才能跨请求恢复——所以在模块顶层创建一个共享实例
  const sharedCheckpointer = mode === "no-checkpoint" ? undefined : getSharedMemorySaver();
  const graph = buildCheckpointGraphWithSaver(mode, sharedCheckpointer);

  let result: unknown;
  if (resume !== undefined) {
    // 第二次调用：从中断点继续。resume 传 object { confirm: boolean } 绕过 LangGraph 1.4.16
    // mapCommand 的 `if (cmd.resume)` 真值判断（false 被吞）。
    const resumeInput = typeof resume === "boolean" ? { confirm: resume } : resume;
    result = await graph.invoke(new Command({ resume: resumeInput }), config);
  } else {
    // 第一次调用
    result = await graph.invoke({ drinkName, mode }, config);
  }

  // 检查 result.__interrupt__
  if (result && typeof result === "object" && "__interrupt__" in (result as Record<string, unknown>)) {
    const interruptArr = (result as { __interrupt__: Array<{ value: unknown }> }).__interrupt__;
    const first = interruptArr[0];
    return {
      status: "interrupted",
      interruptValue: typeof first?.value === "string" ? first.value : JSON.stringify(first?.value),
      threadId,
      mode,
    };
  }

  // 完成
  const finalState = result as CheckpointCafeState;
  // 流式再跑一遍拿 runtime（为了页面展示 patch 序列）
  const runtime: CheckpointRuntimeStep[] = [];
  let merged: CheckpointCafeState = { drinkName, mode, orderSlip: null, chargeConfirmed: null, chargeResult: null, cupLabel: null, pickupCall: null };
  // resume 时传 null（LangGraph stream 接受 null 从快照继续 emit 后续节点 patch）
  const streamInput: unknown = resume !== undefined ? null : { drinkName, mode };
  const stream = await graph.stream(streamInput as never, { ...config, streamMode: "updates" });
  // 跳过已经 emit 过的 chunk（resume 模式 stream 会重新 emit 之前走过的节点）
  let superStep = 0;
  for await (const chunk of stream) {
    const keys = Object.keys(chunk);
    for (const node of keys) {
      if (node === "__interrupt__") continue;
      const patch = (chunk as Record<string, Partial<CheckpointCafeState>>)[node] ?? {};
      merged = { ...merged, ...patch };
      const label = NODE_LABELS[node] ?? node;
      runtime.push({ node, label, patch, stateAfter: { ...merged } });
    }
    superStep += 1;
    if (superStep > 20) break;  // 安全保护
  }

  // 检查点计数（演示用）
  let checkpointCount: number | undefined;
  if (sharedCheckpointer) {
    const tuples: unknown[] = [];
    for await (const t of sharedCheckpointer.list(config)) {
      tuples.push(t);
    }
    checkpointCount = tuples.length;
  }

  return {
    status: resume !== undefined ? "resumed" : "completed",
    finalState,
    runtime,
    threadId,
    mode,
    checkpointCount,
  };
}

// 共享 MemorySaver 实例——跨请求同一 thread_id 恢复
let SHARED_SAVER: MemorySaver | null = null;
function getSharedMemorySaver(): MemorySaver {
  if (!SHARED_SAVER) SHARED_SAVER = new MemorySaver();
  return SHARED_SAVER;
}

function buildCheckpointGraphWithSaver(mode: CheckpointMode, checkpointer: MemorySaver | undefined) {
  // 跟 buildCheckpointGraph 类似，但允许外部传 saver（同一实例跨请求共享）
  return new StateGraph(CheckpointStateAnnotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("chargeRequest", (state: CheckpointCafeState) => chargeRequestNode(state, mode))
    .addNode("chargeMemberCard", chargeMemberCardNode)
    .addNode("brewHot", brewHotNode)
    .addNode("serve", serveNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "chargeRequest")
    .addEdge("chargeRequest", "chargeMemberCard")
    .addEdge("chargeMemberCard", "brewHot")
    .addEdge("brewHot", "serve")
    .addEdge("serve", END)
    .compile({ checkpointer });
}
