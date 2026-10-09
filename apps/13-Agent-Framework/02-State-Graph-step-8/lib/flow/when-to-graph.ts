/**
 * 职责：装配「该不该上图」图（变体 J）。
 *
 * 形状：
 *   flat-single-node：START → answerNode → END（单节点直接给答案，不上图）
 *   over-graphed：     START → takeOrder → brewHot → serve → END（FAQ 硬套完整图；浪费三站）
 *
 * 数据流：question + mode → buildWhenToGraph → stream(updates) → 累加 runtime。
 *
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { notifyPickup, placeOrder } from "../tools/cafe-tools.js";
import { logger } from "../logger.js";

export const DEFAULT_QUESTION = "店几点关门？";
export const ANSWER_OPEN_HOURS = "营业时间：周一至周日 07:00 - 22:00。";

export type WhenToGraphMode = "flat-single-node" | "over-graphed";

export type WhenToGraphState = {
  question: string;
  mode: WhenToGraphMode;
  /** flat 模式下：answer 字段直接给答案；over-graphed 模式下：answer 由 serve 字段临时承载 */
  answer: string | null;
  orderSlip: string | null;
  cupLabel: string | null;
  pickupCall: string | null;
  /** 运行时跑了多少站——over-graphed 比 flat 多三站，是「变体」的可观察代价 */
  stationsRun: number;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

const WhenToGraphStateAnnotation = Annotation.Root({
  question: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode: Annotation<WhenToGraphMode>({ reducer: lastWrite, default: () => "flat-single-node" as WhenToGraphMode }),
  answer: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  stationsRun: Annotation<number>({ reducer: lastWrite, default: () => 0 }),
});

/**
 * flat-single-node 模式的单节点：直接给答案。
 * 教学点：FAQ 类问题不调任何工具——一次回话即可，不上图。
 */
export async function answerDirectNode(state: WhenToGraphState): Promise<Partial<WhenToGraphState>> {
  const t0 = Date.now();
  const patch: Partial<WhenToGraphState> = {
    answer: ANSWER_OPEN_HOURS,
    stationsRun: 1,
  };
  logger.info("answerDirectNode", "返回节点 patch：answer + stationsRun=1", "FAQ 单节点直接给答案——不上图", {
    入参: { question: state.question, mode: state.mode },
    __code: "return { answer: ANSWER_OPEN_HOURS, stationsRun: 1 };",
    返回值: patch,
    耗时ms: Date.now() - t0,
  });
  return patch;
}

/**
 * over-graphed 模式：把 FAQ 硬套进完整进出图——三站全是浪费。
 * 教学点：runtime 跑出三个 patch、orderSlip / cupLabel / pickupCall 三个字段被写了，但和「几点关门」毫无关系。
 */
export async function takeOrderWasteNode(state: WhenToGraphState): Promise<Partial<WhenToGraphState>> {
  const t0 = Date.now();
  const order = await placeOrder({ drinkName: state.question });
  const patch: Partial<WhenToGraphState> = {
    orderSlip: order.orderSlip,
    stationsRun: state.stationsRun + 1,
  };
  logger.info("takeOrderWasteNode", "返回节点 patch：orderSlip + stationsRun++", "硬套图——给营业时间的问题塞了一个下单", {
    入参: { question: state.question },
    __code: "const order = await placeOrder({ drinkName: state.question }); return { orderSlip, stationsRun: state.stationsRun + 1 };",
    返回值: patch,
    耗时ms: Date.now() - t0,
  });
  return patch;
}

export async function brewHotWasteNode(state: WhenToGraphState): Promise<Partial<WhenToGraphState>> {
  const t0 = Date.now();
  const patch: Partial<WhenToGraphState> = {
    cupLabel: `热杯（写了也没用——客人不问喝什么）：「${state.orderSlip ?? ""}」`,
    stationsRun: state.stationsRun + 1,
  };
  logger.info("brewHotWasteNode", "返回节点 patch：cupLabel + stationsRun++", "硬套图——制作站被无意义触发", {
    入参: { orderSlip: state.orderSlip },
    __code: "return { cupLabel: '热杯（写来没用）', stationsRun: state.stationsRun + 1 };",
    返回值: patch,
    耗时ms: Date.now() - t0,
  });
  return patch;
}

export async function serveWasteNode(state: WhenToGraphState): Promise<Partial<WhenToGraphState>> {
  const t0 = Date.now();
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "（客人没下单）",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  const patch: Partial<WhenToGraphState> = {
    pickupCall: `${notify.pickupCall}（这条广播同样跟营业时间无关）`,
    stationsRun: state.stationsRun + 1,
  };
  logger.info("serveWasteNode", "返回节点 patch：pickupCall + stationsRun++", "硬套图——出餐站再被无意义触发一次", {
    入参: { orderSlip: state.orderSlip, cupLabel: state.cupLabel },
    __code: "return { pickupCall: notify.pickupCall, stationsRun: state.stationsRun + 1 };",
    返回值: patch,
    耗时ms: Date.now() - t0,
  });
  return patch;
}

const NODE_LABELS: Record<string, string> = {
  answerDirect: "answerDirect（单节点直接给答案）",
  takeOrder: "takeOrder（硬套图）",
  brewHot: "brewHot（硬套图）",
  serve: "serve（硬套图）",
};

export type WhenToGraphRuntimeStep = {
  node: string;
  label: string;
  patch: Partial<WhenToGraphState>;
  stateAfter: WhenToGraphState;
};

export type WhenToGraphInvokeResult = {
  mode: WhenToGraphMode;
  input: WhenToGraphState;
  runtime: WhenToGraphRuntimeStep[];
  finalState: WhenToGraphState;
};

export function buildWhenToGraph(mode: WhenToGraphMode) {
  logger.info("buildWhenToGraph", "调用函数：buildWhenToGraph", "按 mode 装配图；flat-single-node 走单节点，over-graphed 走完整进出图", {
    __code: "mode === 'flat-single-node' ? new StateGraph(...).addNode('answerDirect', ...).compile() : ... 三节点",
    入参: { mode },
  });

  if (mode === "flat-single-node") {
    return new StateGraph(WhenToGraphStateAnnotation)
      .addNode("answerDirect", answerDirectNode)
      .addEdge(START, "answerDirect")
      .addEdge("answerDirect", END)
      .compile();
  }

  // over-graphed：硬套完整进出图
  return new StateGraph(WhenToGraphStateAnnotation)
    .addNode("takeOrder", takeOrderWasteNode)
    .addNode("brewHot", brewHotWasteNode)
    .addNode("serve", serveWasteNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "brewHot")
    .addEdge("brewHot", "serve")
    .addEdge("serve", END)
    .compile();
}

export async function invokeWhenToGraph(input: {
  question: string;
  mode: WhenToGraphMode;
}): Promise<WhenToGraphInvokeResult> {
  const t0 = Date.now();
  const { question, mode } = input;
  const initial: WhenToGraphState = {
    question,
    mode,
    answer: null,
    orderSlip: null,
    cupLabel: null,
    pickupCall: null,
    stationsRun: 0,
  };
  const graph = buildWhenToGraph(mode);

  logger.info("invokeWhenToGraph", "开始 invoke", "stream 模式跑图；flat 1 站，over-graphed 3 站", {
    入参: input,
  });

  const runtime: WhenToGraphRuntimeStep[] = [];
  let merged: WhenToGraphState = { ...initial };
  const stream = await graph.stream({ question, mode } as WhenToGraphState, { streamMode: "updates" });
  for await (const chunk of stream) {
    for (const node of Object.keys(chunk)) {
      const patch = (chunk as Record<string, Partial<WhenToGraphState>>)[node] ?? {};
      merged = { ...merged, ...patch };
      const label = NODE_LABELS[node] ?? node;
      runtime.push({ node, label, patch, stateAfter: { ...merged } });
    }
  }

  logger.info("invokeWhenToGraph", "结束 invoke", `跑了 ${merged.stationsRun} 站`, {
    返回值: { mode, runtimeLength: runtime.length, finalState: merged },
    耗时ms: Date.now() - t0,
  });

  return {
    mode,
    input: initial,
    runtime,
    finalState: merged,
  };
}