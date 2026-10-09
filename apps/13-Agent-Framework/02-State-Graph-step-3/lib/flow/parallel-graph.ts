/**
 * 职责：装配三张图（no-reducer / array-reducer / distinct-fields 三种 mode）+ 跑一遍 + 计算每一站 patch。
 * 形状：START → takeOrder（写 orderSlip）
 *                     ├─→ branchHot（写 cupLabel「热美式」或 hotCupLabel「热美式」按 mode 决定）
 *                     └─→ branchIce（写 cupLabel「冰拿铁」或 iceCupLabel「冰拿铁」按 mode 决定）
 *                     → 汇合到 serve → END
 *
 * takeOrder 出两条边到 branchHot / branchIce，框架在**同一个超级步**里并行跑它们。
 * 三个 mode 控制归约方式（控制同一字段 cupLabel 在并行时的合并规则）：
 *   no-reducer     cupLabel 用 throwOnParallelConflict → 两个节点都写 cupLabel → 框架抛异常（接口级报错）
 *   array-reducer  cupLabel 用 array 归约函数 → 合并成 [冰杯，热杯]
 *   distinct-fields hot / ice 分支写不同字段（hotCupLabel / iceCupLabel）→ 不冲突
 *
 * 数据流：drinkName + mode → buildParallelGraph → stream(updates) → 每一站 patch + 合并后状态。
 * 为什么单独成文件：route 只校验入参；学习者复习时应先打开本文件把主路径读完。
 * 注：本文件是纯运行时——不知道有展示代码字符串，也不知道 declaration 是给谁看的。
 *
 * 与条件分流图、回边图的区别：父节点 takeOrder 一次性出两条边到两个分支节点，框架同 super-step 并行跑。
 * 节点函数签名仍然吃状态、只 return 自己改的字段；并行合并的差异由「状态标注的 reducer」决定。
 */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  brewHotDrink,
  brewIceDrink,
  notifyPickup,
  placeOrder,
} from "../tools/cafe-tools.js";

export const DEFAULT_DRINK_PARALLEL = "来一杯热美式 + 一杯冰拿铁。";

export type ParallelMode = "no-reducer" | "array-reducer" | "distinct-fields";

export type ParallelCafeState = {
  drinkName: string;
  orderSlip: string | null;
  // cupLabel 在三种 mode 下形态不同：no-reducer 模式 framework 调 throwOnParallelConflict 抛错；
  // array-reducer 模式被 reducer 合并成 string[]；distinct-fields 模式永远 null（分支不写）。
  // 用 any 是因为 LangGraph Annotation 推断 reducer 类型时需要兼容三种；runtime 端自己用 mode 分流处理。
  cupLabel: any;
  hotCupLabel: string | null;
  iceCupLabel: string | null;
  pickupCall: string | null;
};

function lastWrite<T>(_left: T, right: T): T {
  return right;
}

/** array 归约函数：把 left 和 right 合并成 array，丢掉 null。 */
function appendArray(left: unknown, right: unknown): unknown[] {
  const base: unknown[] = Array.isArray(left) ? left : left ? [left] : [];
  return right ? [...base, right] : base;
}

/**
 * 并行冲突时显式抛错——这一课的「接口级报错」核心。
 * 默认 lastWrite 是默默覆盖，对并行写同一字段不报错——这正是手写版「静默丢一杯」的等价行为，
 * 但框架版要拦下：让学习者看见错、决定修法（写 reducer / 改不同字段），而不是事后追查。
 */
function throwOnParallelConflict<T>(left: T, right: T): T {
  if (left === null || left === undefined) return right;
  if (right === null || right === undefined) return left;
  throw new Error(
    "并行冲突：两个节点在同一 super-step 写了同一字段 cupLabel。lastWrite 默默覆盖会丢一杯；改 array 归约函数（合并成数组）或让两个分支写不同字段即可解决。",
  );
}

function makeStateAnnotation(mode: ParallelMode) {
  // no-reducer 模式故意把 cupLabel 的 reducer 设成「冲突时抛错」——这样 framework 内部并行写同一字段会直接 throw。
  // 这条 reducer 是这一课的「接口级报错」载体：让学习者看见错，而不是默默丢一杯。
  const cupLabelReducer =
    mode === "array-reducer"
      ? appendArray
      : mode === "no-reducer"
        ? throwOnParallelConflict
        : lastWrite;
  return Annotation.Root({
    drinkName: Annotation<string>({ reducer: lastWrite, default: () => "" }),
    orderSlip: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
    // cupLabel 字段允许任何值（string / string[] / null）——不同 mode 下 reducer 行为不同。
    cupLabel: Annotation<any>({ reducer: cupLabelReducer, default: () => null }),
    hotCupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
    iceCupLabel: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
    pickupCall: Annotation<string | null>({ reducer: lastWrite, default: () => null }),
  });
}

export async function takeOrderNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
  const order = await placeOrder({ drinkName: state.drinkName });
  return { orderSlip: order.orderSlip };
}

export function buildParallelGraph(mode: ParallelMode) {
  // 按 mode 决定每个并行分支写哪些字段——distinct-fields 模式只写独立字段（不写 cupLabel），
  // no-reducer / array-reducer 模式写 cupLabel（让 framework 调对应 reducer）。
  function makeBranchHotNode(m: ParallelMode) {
    return async function branchHotNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
      const hot = await brewHotDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
      if (m === "distinct-fields") {
        return { hotCupLabel: hot.cupLabel };
      }
      return { cupLabel: hot.cupLabel, hotCupLabel: hot.cupLabel };
    };
  }
  function makeBranchIceNode(m: ParallelMode) {
    return async function branchIceNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
      const ice = await brewIceDrink({ orderSlip: state.orderSlip ?? "（订单条还是空的）" });
      if (m === "distinct-fields") {
        return { iceCupLabel: ice.cupLabel };
      }
      return { cupLabel: ice.cupLabel, iceCupLabel: ice.cupLabel };
    };
  }

  function makeServeNode(m: ParallelMode) {
    return async function serveNode(state: ParallelCafeState): Promise<Partial<ParallelCafeState>> {
      // 汇合点：把并行分支的结果拼成取餐广播。
      // 三个 mode 下状态里的杯盖字段位置不同：
      //   no-reducer     不会到这一站（前面抛错）
      //   array-reducer  cupLabel 是 array
      //   distinct-fields cupLabel 是 null，热/冰在 hotCupLabel / iceCupLabel
      let labelText: string;
      const label = state.cupLabel;
      if (m === "array-reducer" && Array.isArray(label)) {
        labelText = label.join(" + ");
      } else if (m === "distinct-fields") {
        labelText = `${state.hotCupLabel ?? "（热杯空）"} + ${state.iceCupLabel ?? "（冰杯空）"}`;
      } else if (label) {
        labelText = `${label} + ${state.iceCupLabel ?? "（另一杯空）"}`;
      } else {
        labelText = `${state.hotCupLabel ?? "（热杯空）"} + ${state.iceCupLabel ?? "（冰杯空）"}`;
      }
      const notify = await notifyPickup({
        orderSlip: state.orderSlip ?? "这单",
        cupLabel: labelText,
      });
      return { pickupCall: notify.pickupCall };
    };
  }

  const annotation = makeStateAnnotation(mode);
  return new StateGraph(annotation)
    .addNode("takeOrder", takeOrderNode)
    .addNode("branchHot", makeBranchHotNode(mode))
    .addNode("branchIce", makeBranchIceNode(mode))
    .addNode("serve", makeServeNode(mode))
    .addEdge(START, "takeOrder")
    // takeOrder 出两条 fan-out 边到 branchHot / branchIce
    .addEdge("takeOrder", "branchHot")
    .addEdge("takeOrder", "branchIce")
    // branchHot / branchIce 各自 addEdge 到 serve（fan-in 汇合点）
    .addEdge("branchHot", "serve")
    .addEdge("branchIce", "serve")
    .addEdge("serve", END)
    .compile();
}

const NODE_LABELS: Record<string, string> = {
  takeOrder: "点单（fan-out 起点）",
  branchHot: "热饮制作（并行分支 1）",
  branchIce: "冰饮制作（并行分支 2）",
  serve: "出餐（fan-in 汇合点）",
};

export type ParallelRuntimeStep = {
  node: string;
  label: string;
  patch: Partial<ParallelCafeState>;
  stateAfter: ParallelCafeState;
};

export async function runParallelGraph(drinkName: string, mode: ParallelMode): Promise<{
  input: ParallelCafeState;
  runtime: ParallelRuntimeStep[];
  finalState: ParallelCafeState;
  /** 哪条 fan-out 边先记录——用于「并行同 super-step」的页面提示。 */
  parallelGroup: { nodes: string[]; superStep: number };
}> {
  const graph = buildParallelGraph(mode);
  const input: ParallelCafeState = {
    drinkName,
    orderSlip: null,
    cupLabel: null,
    hotCupLabel: null,
    iceCupLabel: null,
    pickupCall: null,
  };
  const runtime: ParallelRuntimeStep[] = [];
  let merged: ParallelCafeState = { ...input };
  const stream = await graph.stream(input, { streamMode: "updates" });
  let superStep = 0;
  const parallelGroup: { nodes: string[]; superStep: number } = { nodes: [], superStep: 0 };
  // 选好本 mode 下 cupLabel 字段用的 reducer；其他字段还是 lastWrite。
  const cupLabelReducer =
    mode === "array-reducer" ? appendArray : mode === "no-reducer" ? throwOnParallelConflict : lastWrite;
  for await (const chunk of stream) {
    const keys = Object.keys(chunk);
    if (keys.length > 1) {
      // 同一 super-step 内多个节点并行——记录到 parallelGroup
      parallelGroup.nodes = keys;
      parallelGroup.superStep = superStep;
    }
    // 同一 chunk 内的多个 patch 要按字段 reducer 合并（不能用对象展开，那是 lastWrite）。
    // LangGraph stream(updates) 在并行节点时把两个 patch 放在同一 chunk 的不同 key 下，
    // framework 不帮你合并——你自己按字段 reducer 合并。
    // 跨 chunk 的合并要读 merged（已合并的 state）作 oldVal，因为 mergedPatch 每次 chunk 重置。
    const mergedPatch: Record<string, unknown> = {};
    for (const node of keys) {
      const patch = (chunk as Record<string, Partial<ParallelCafeState>>)[node] ?? {};
      for (const k of Object.keys(patch)) {
        const newVal = (patch as Record<string, unknown>)[k];
        const oldVal = (merged as Record<string, unknown>)[k];
        if (k === "cupLabel" && mode === "array-reducer") {
          mergedPatch[k] = cupLabelReducer(oldVal, newVal);
        } else {
          mergedPatch[k] = newVal;
        }
      }
    }
    merged = { ...merged, ...mergedPatch } as ParallelCafeState;
    for (const node of keys) {
      const patch = (chunk as Record<string, Partial<ParallelCafeState>>)[node] ?? {};
      const label = NODE_LABELS[node] ?? node;
      runtime.push({
        node,
        label,
        patch,
        stateAfter: { ...merged },
      });
    }
    superStep += 1;
  }
  return { input, runtime, finalState: merged, parallelGroup };
}
