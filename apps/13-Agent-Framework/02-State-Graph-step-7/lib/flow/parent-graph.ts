/**
 * 职责：装配主子图（变体 I · 子图）+ 跑一遍 + 返回 runtime。
 *
 * 形状：START → takeOrder → makeDrink（flat 模式是普通节点；subgraph-same-fields 模式是编译好的子图；subgraph-renamed 模式是 wrapper） → serve → END
 *
 * 三个 mode 演示：
 *   flat                       一张大图里写完 makeDrink（普通节点函数）。无子图。
 *   subgraph-same-fields       makeDrink 是编译好的子图。父图 addNode("makeDrink", sub) 直接传子图——**同名字段自动传**。
 *   subgraph-renamed          makeDrink 是 wrapper 节点函数；wrapper 手动调 subBrewHotRenamed.invoke({ drinkSlip }) 并把 label 翻成 cupLabel。
 *
 * 数据流：drinkName + mode → buildParentGraph → stream(updates) → 每站 patch + 合并后状态 + 节点名。
 *
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { notifyPickup, placeOrder } from "../tools/cafe-tools.js";
import { logger } from "../logger.js";
import {
  buildSubgraphBrewRenamed,
  buildSubgraphBrewSameFields,
  SUBGRAPH_DEMO_LABEL,
} from "./subgraph-brew.js";

export const DEFAULT_DRINK_PARENT = "来一杯中杯热拿铁。";

export type SubgraphMode = "flat" | "subgraph-same-fields" | "subgraph-renamed";

export type ParentCafeState = {
  drinkName: string;
  mode: SubgraphMode;
  orderSlip: string | null;
  cupLabel: string | null;
  retryCount: number;
  pickupCall: string | null;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

const ParentStateAnnotation = Annotation.Root({
  drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
  mode: Annotation<SubgraphMode>({ reducer: lastWrite, default: () => "flat" as SubgraphMode }),
  orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  cupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  retryCount: Annotation<number>({ reducer: lastWrite, default: () => 0 }),
  pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
});

export async function takeOrderNode(state: ParentCafeState): Promise<Partial<ParentCafeState>> {
  const t0 = Date.now();
  const order = await placeOrder({ drinkName: state.drinkName });
  logger.info("takeOrderNode", "返回节点 patch：orderSlip", "点单工具返回订单条", {
    入参: { drinkName: state.drinkName },
    __code: "return { orderSlip: order.orderSlip };",
    返回值: { orderSlip: order.orderSlip },
    耗时ms: Date.now() - t0,
  });
  return { orderSlip: order.orderSlip };
}

/**
 * flat 模式的 makeDrink：和子图内的 brewHot 等价，但写在主图自己的代码里。
 * 教学点：写法完全一样——只是不抽成图。
 */
export async function makeDrinkFlatNode(state: ParentCafeState): Promise<Partial<ParentCafeState>> {
  const t0 = Date.now();
  const nextCount = (state.retryCount ?? 0) + 1;
  const cupLabel = SUBGRAPH_DEMO_LABEL.replace("{slip}", state.orderSlip ?? "");
  const patch = { retryCount: nextCount, cupLabel };
  logger.info("makeDrinkFlatNode", "返回节点 patch：cupLabel + retryCount", "内联 brewHot；不抽成子图", {
    入参: { orderSlip: state.orderSlip, retryCount: state.retryCount },
    __code: "return { retryCount: nextCount, cupLabel };",
    返回值: patch,
    耗时ms: Date.now() - t0,
  });
  return patch;
}

/**
 * subgraph-renamed 模式的 wrapper：手动把父字段 orderSlip → 子字段 drinkSlip；
 * 子图返回后把 label → 父字段 cupLabel、retries → 父字段 retryCount。
 * 教学点：不同名字段不会自动传；必须自己写 wrapper。
 */
export async function makeDrinkRenamedWrapper(state: ParentCafeState): Promise<Partial<ParentCafeState>> {
  const t0 = Date.now();
  const subRenamed = buildSubgraphBrewRenamed();
  logger.info("makeDrinkRenamedWrapper", "调用函数：makeDrinkRenamedWrapper", "手动翻译父字段 orderSlip → 子字段 drinkSlip；调用子图 invoke；再翻回来", {
    __code: "const sub = await subRenamed.invoke({ drinkSlip: state.orderSlip }); return { cupLabel: sub.label, retryCount: sub.retries };",
    入参: { orderSlip: state.orderSlip, retryCount: state.retryCount },
  });
  // 调用子图 invoke——这里走的是 subgraph-as-call，不是 addNode("makeDrink", subRenamed)
  // 因为父字段和子字段名不一样，子图间不会自动传。手动翻译。
  const subResult = await subRenamed.invoke({ drinkSlip: state.orderSlip ?? "" });
  const patch: Partial<ParentCafeState> = {
    cupLabel: subResult.label ?? null,
    retryCount: subResult.retries,
  };
  logger.info("makeDrinkRenamedWrapper", "返回节点 patch：cupLabel / retryCount", "从子图翻回父字段", {
    返回值: patch,
    耗时ms: Date.now() - t0,
  });
  return patch;
}

export async function serveNode(state: ParentCafeState): Promise<Partial<ParentCafeState>> {
  const t0 = Date.now();
  const notify = await notifyPickup({
    orderSlip: state.orderSlip ?? "这杯",
    cupLabel: state.cupLabel ?? "（杯盖还是空的）",
  });
  logger.info("serveNode", "返回节点 patch：pickupCall", "出餐广播工具返回", {
    入参: { orderSlip: state.orderSlip, cupLabel: state.cupLabel },
    __code: "return { pickupCall: notify.pickupCall };",
    返回值: { pickupCall: notify.pickupCall },
    耗时ms: Date.now() - t0,
  });
  return { pickupCall: notify.pickupCall };
}

const NODE_LABELS: Record<string, string> = {
  takeOrder: "点单",
  makeDrink: "制作（含子图 / flat 等价节点）",
  serve: "出餐",
};

const SUBGRAPH_STATION_LABELS: Record<string, string> = {
  subBrewHot: "brewHot（子图内）",
};

export type ParentRuntimeStep = {
  node: string;
  label: string;
  patch: Partial<ParentCafeState>;
  stateAfter: ParentCafeState;
  /** makeDrink 节点内部子图跑过的站（仅 subgraph-same-fields / subgraph-renamed 模式有内容） */
  subRuntime?: { node: string; label: string; patch: unknown }[];
};

export type ParentInvokeResult = {
  mode: SubgraphMode;
  input: ParentCafeState;
  runtime: ParentRuntimeStep[];
  finalState: ParentCafeState;
};

export function buildParentGraph(mode: SubgraphMode) {
  logger.info("buildParentGraph", "调用函数：buildParentGraph", "按 mode 装配 makeDrink 节点；同名字段直接 addNode 子图，不同名走 wrapper", {
    __code: "mode === 'flat' ? makeDrinkFlatNode : mode === 'subgraph-same-fields' ? buildSubgraphBrewSameFields() : makeDrinkRenamedWrapper",
    入参: { mode },
  });

  // 按 mode 先选 makeDrink 的动作——避免 addNode 类型推断拒绝没在链上的节点名。
  // flat = 普通节点；subgraph-same-fields = 直接 addNode 子图（同名字段自动传）；subgraph-renamed = wrapper
  let makeDrinkAction: (state: ParentCafeState) => Promise<Partial<ParentCafeState>>;
  if (mode === "flat") {
    makeDrinkAction = makeDrinkFlatNode;
  } else if (mode === "subgraph-same-fields") {
    // **教学点**：父图 addNode("makeDrink", subgraph) 直接用编译好的子图作为节点。
    // 同名字段（orderSlip / cupLabel / retryCount）会自动传。无需 wrapper。
    // 类型上 langgraph 接受 CompiledStateGraph（RunnableLike）。
    makeDrinkAction = buildSubgraphBrewSameFields() as unknown as (
      state: ParentCafeState,
    ) => Promise<Partial<ParentCafeState>>;
  } else {
    // subgraph-renamed：不同名字段不会自动传；用 wrapper 手动 invoke 子图并翻译字段。
    makeDrinkAction = makeDrinkRenamedWrapper;
  }

  return new StateGraph(ParentStateAnnotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("makeDrink", makeDrinkAction)
    .addNode("serve", serveNode)
    .addEdge(START, "takeOrder")
    .addEdge("takeOrder", "makeDrink")
    .addEdge("makeDrink", "serve")
    .addEdge("serve", END)
    .compile();
}

/**
 * 跑一遍主图。stream 模式一边跑一边累加 runtime；
 * 当节点是 subgraph 时，把子图的内部 patch 也记到 subRuntime 里（页面能看见）。
 */
export async function invokeParentGraph(input: {
  drinkName: string;
  mode: SubgraphMode;
}): Promise<ParentInvokeResult> {
  const t0 = Date.now();
  const { drinkName, mode } = input;
  const initial: ParentCafeState = {
    drinkName,
    mode,
    orderSlip: null,
    cupLabel: null,
    retryCount: 0,
    pickupCall: null,
  };
  const graph = buildParentGraph(mode);
  const subRenamed = mode === "subgraph-renamed" ? buildSubgraphBrewRenamed() : null;

  logger.info("invokeParentGraph", "开始 invoke", "stream 模式跑主图；subgraph-same-fields 自动传字段，subgraph-renamed 走 wrapper", {
    入参: input,
  });

  const runtime: ParentRuntimeStep[] = [];
  let merged: ParentCafeState = { ...initial };

  // 跑主图 stream
  const parentStream = await graph.stream({ drinkName, mode } as ParentCafeState, { streamMode: "updates" });
  for await (const chunk of parentStream) {
    for (const node of Object.keys(chunk)) {
      const patch = (chunk as Record<string, Partial<ParentCafeState>>)[node] ?? {};
      merged = { ...merged, ...patch };
      const label = NODE_LABELS[node] ?? node;
      // subgraph-same-fields 模式下，makeDrink 是子图——它对外只写回同名字段（orderSlip / cupLabel / retryCount）
      // subgraph-renamed 模式下，wrapper 写 cupLabel / retryCount
      const step: ParentRuntimeStep = {
        node,
        label,
        patch,
        stateAfter: { ...merged },
      };
      runtime.push(step);
    }
  }

  // subgraph-renamed 模式：上面的 stream 不会自动展示 wrapper 内部子图的 patch——
  // 因为 wrapper 是普通函数而不是 stream 节点。手动重跑一次子图补 subRuntime（教学用）。
  if (mode === "subgraph-renamed" && subRenamed) {
    const makeDrinkStep = runtime.find((s) => s.node === "makeDrink");
    if (makeDrinkStep) {
      makeDrinkStep.subRuntime = [
        {
          node: "subBrewHot",
          label: SUBGRAPH_STATION_LABELS.subBrewHot,
          patch: {
            drinkSlip: makeDrinkStep.stateAfter.orderSlip,
            retries: makeDrinkStep.stateAfter.retryCount,
            label: makeDrinkStep.stateAfter.cupLabel,
          },
        },
      ];
    }
  }

  // subgraph-same-fields 模式：补 subRuntime 教学用（不是真实从 stream 抓的——父图 stream 不展示子图节点名）
  if (mode === "subgraph-same-fields") {
    const makeDrinkStep = runtime.find((s) => s.node === "makeDrink");
    if (makeDrinkStep) {
      makeDrinkStep.subRuntime = [
        {
          node: "subBrewHot",
          label: SUBGRAPH_STATION_LABELS.subBrewHot,
          patch: {
            orderSlip: makeDrinkStep.stateAfter.orderSlip,
            retryCount: makeDrinkStep.stateAfter.retryCount,
            cupLabel: makeDrinkStep.stateAfter.cupLabel,
          },
        },
      ];
    }
  }

  logger.info("invokeParentGraph", "结束 invoke", "整张主图走完", {
    返回值: { runtimeLength: runtime.length, finalState: merged },
    耗时ms: Date.now() - t0,
  });

  return {
    mode,
    input: initial,
    runtime,
    finalState: merged,
  };
}