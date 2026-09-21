/**
 * 本步核心：用 LangGraph 的状态图（State Graph）声明一条最简单的线性出杯图
 * （点单 → 热饮制作 → 出餐），compile 之后 stream 一次，把每一站的补丁吐出来。
 *
 * 职责：装配线性图 + 跑一遍。页面上的声明说明在 linear-graph-view.ts。
 * 数据流：drinkName → buildLinearGraph → stream(updates) → 每一站 patch + 合并后的状态。
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { logger } from "../logger.js";

export const DEFAULT_DRINK = "来一杯中杯热拿铁。";

export type CafeState = {
  drinkName: string;
  orderSlip: string | null;
  cupLabel: string | null;
  pickupCall: string | null;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

const CafeStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({
    reducer: lastWrite,
    default: () => "",
  }),
  orderSlip: Annotation<string | null>({
    reducer: lastWrite,
    default: () => null,
  }),
  cupLabel: Annotation<string | null>({
    reducer: lastWrite,
    default: () => null,
  }),
  pickupCall: Annotation<string | null>({
    reducer: lastWrite,
    default: () => null,
  }),
});

export const STATE_CODE = `const CafeStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});`;

export function takeOrderNode(state: CafeState): Partial<CafeState> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-takeOrderNode",
    "调用函数开始：takeOrderNode",
    "为什么写这条日志：点单站只根据客人口述写出订单条，不改当前站。当前：线性图第一站。",
    { 入参: { state }, __code: takeOrderNode.toString() },
  );
  const patch: Partial<CafeState> = {
    orderSlip: "中杯热拿铁，双份浓缩，热",
  };
  logger.info(
    "│ 调用函数-takeOrderNode",
    "调用函数结束：takeOrderNode",
    "为什么写这条日志：框架拿到这份补丁后按归约函数合并，再沿固定边走到热饮制作。当前：点单完成。",
    { 返回值: patch, 耗时ms: Date.now() - t0 },
  );
  return patch;
}

export function brewHotNode(state: CafeState): Partial<CafeState> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-brewHotNode",
    "调用函数开始：brewHotNode",
    "为什么写这条日志：热饮站读订单条、写出杯盖。当前：线性图第二站。",
    { 入参: { state }, __code: brewHotNode.toString() },
  );
  const patch: Partial<CafeState> = {
    cupLabel: `热杯。杯盖写着「${state.orderSlip ?? "（订单条还是空的）"}」。放在热饮区。`,
  };
  logger.info(
    "│ 调用函数-brewHotNode",
    "调用函数结束：brewHotNode",
    "为什么写这条日志：杯盖有了，固定边会走到出餐。当前：热饮制作完成。",
    { 返回值: patch, 耗时ms: Date.now() - t0 },
  );
  return patch;
}

export function serveNode(state: CafeState): Partial<CafeState> {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-serveNode",
    "调用函数开始：serveNode",
    "为什么写这条日志：出餐站读订单条和杯盖，写出取餐广播。当前：线性图第三站。",
    { 入参: { state }, __code: serveNode.toString() },
  );
  const patch: Partial<CafeState> = {
    pickupCall: `A07 号请到取餐口，${state.orderSlip ?? "这杯"} 好了。`,
  };
  logger.info(
    "│ 调用函数-serveNode",
    "调用函数结束：serveNode",
    "为什么写这条日志：取餐广播写好后，固定边走到 END，invoke / stream 结束。当前：出餐完成。",
    { 返回值: patch, 耗时ms: Date.now() - t0 },
  );
  return patch;
}

export const TAKE_ORDER_CODE = `function takeOrderNode(state: CafeState): Partial<CafeState> {
  return { orderSlip: "中杯热拿铁，双份浓缩，热" };
}`;

export const BREW_HOT_CODE = `function brewHotNode(state: CafeState): Partial<CafeState> {
  return {
    cupLabel: \`热杯。杯盖写着「\${state.orderSlip}」。放在热饮区。\`,
  };
}`;

export const SERVE_CODE = `function serveNode(state: CafeState): Partial<CafeState> {
  return {
    pickupCall: \`A07 号请到取餐口，\${state.orderSlip} 好了。\`,
  };
}`;

const NODE_META: Record<
  "takeOrder" | "brewHot" | "serve",
  { label: string; why: string; code: string }
> = {
  takeOrder: {
    label: "点单",
    why: "读 drinkName，写出 orderSlip。这一站不管热还是冰——step-1 故意收成线性，分流留给下一步。",
    code: TAKE_ORDER_CODE,
  },
  brewHot: {
    label: "热饮制作",
    why: "读 orderSlip，写出 cupLabel。框架沿 addEdge 走到这里，没有 if/else。",
    code: BREW_HOT_CODE,
  },
  serve: {
    label: "出餐",
    why: "读 orderSlip，写出 pickupCall。下一站是 END，图停。",
    code: SERVE_CODE,
  },
};

export const BUILD_CODE = `const graph = new StateGraph(CafeStateAnnotation)
  .addNode("takeOrder", takeOrderNode)
  .addNode("brewHot", brewHotNode)
  .addNode("serve", serveNode)
  .addEdge(START, "takeOrder")
  .addEdge("takeOrder", "brewHot")
  .addEdge("brewHot", "serve")
  .addEdge("serve", END)
  .compile();`;

export type RuntimeStep = {
  node: string;
  label: string;
  why: string;
  code: string;
  patch: Partial<CafeState>;
  stateAfter: CafeState;
};

export function buildLinearGraph() {
  const t0 = Date.now();
  logger.info(
    "│ 调用函数-buildLinearGraph",
    "调用函数开始：buildLinearGraph",
    "为什么写这条日志：把状态标注、三个节点、四条边收成可运行对象。当前：还在声明期。",
    { 入参: {}, __code: BUILD_CODE },
  );
  const graph = new StateGraph(CafeStateAnnotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("brewHot", brewHotNode)
    .addNode("serve", serveNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "brewHot")
    .addEdge("brewHot", "serve")
    .addEdge("serve", END)
    .compile();
  logger.info(
    "│ 调用函数-buildLinearGraph",
    "调用函数结束：buildLinearGraph",
    "为什么写这条日志：compile 之后才可以 stream。当前：声明期结束，准备跑。",
    { 返回值: { compiled: true, nodes: ["takeOrder", "brewHot", "serve"] }, 耗时ms: Date.now() - t0 },
  );
  return graph;
}

export async function runLinearGraph(drinkName: string): Promise<{
  input: CafeState;
  runtime: RuntimeStep[];
  finalState: CafeState;
}> {
  const t0 = Date.now();
  logger.info(
    "调用函数-runLinearGraph",
    "调用函数开始：runLinearGraph",
    "为什么写这条日志：这是本步核心——compile 之后 stream 出每一站补丁。当前：准备跑线性图。",
    { 入参: { drinkName }, __code: runLinearGraph.toString() },
  );
  const graph = buildLinearGraph();
  const input: CafeState = {
    drinkName,
    orderSlip: null,
    cupLabel: null,
    pickupCall: null,
  };
  const runtime: RuntimeStep[] = [];
  let merged: CafeState = { ...input };
  const stream = await graph.stream(input, { streamMode: "updates" });
  for await (const chunk of stream) {
    const keys = Object.keys(chunk);
    for (const node of keys) {
      const patch = (chunk as Record<string, Partial<CafeState>>)[node] ?? {};
      merged = { ...merged, ...patch };
      const meta = NODE_META[node as keyof typeof NODE_META];
      runtime.push({
        node,
        label: meta?.label ?? node,
        why: meta?.why ?? "框架吐出的一站。",
        code: meta?.code ?? "",
        patch,
        stateAfter: { ...merged },
      });
    }
  }
  const 返回值 = { input, runtime, finalState: merged };
  logger.info(
    "调用函数-runLinearGraph",
    "调用函数结束：runLinearGraph",
    "为什么写这条日志：页面要用每一站的补丁和合并后的状态把调度过程摊开。当前：线性图已跑到 END。",
    {
      返回值,
      耗时ms: Date.now() - t0,
      字段释义: {
        "runtime[].node": "这一站的节点名，对应 addNode 的第一个参数",
        "runtime[].patch": "这一站返回的 Partial，框架会按归约函数合并",
        "runtime[].stateAfter": "合并这一站之后的完整状态",
        finalState: "走到 END 时的那一份状态；没有 currentNode 字段——框架自己管当前站",
      },
    },
  );
  return 返回值;
}
