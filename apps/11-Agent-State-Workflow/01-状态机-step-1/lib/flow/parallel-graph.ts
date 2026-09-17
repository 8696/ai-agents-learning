/**
 * 本步核心：图上并行分叉再汇合；各节点只 return 自己改的字段。
 * 职责：并行拿铁图——点单后分流，浓缩和打奶同时写回，两边都在才组装。
 * 数据流：点单 → 分流；浓缩只写 shotReady，打奶只写 milkReady；两边都在才组装。
 * 为什么单独成文件：并行形状和带回边的咖啡店主图分开，避免主图行数撑破。
 */
import { z } from "zod";

export const NODE_IDS = ["takeOrder", "fork", "assemble", "okEnd", "failEnd"] as const;
export type NodeId = (typeof NODE_IDS)[number];
export const MERGE_MODES = ["own", "whole"] as const;
export type MergeMode = (typeof MERGE_MODES)[number];

export const parallelStateSchema = z.object({
  orderId: z.string().min(1),
  currentNode: z.enum(NODE_IDS),
  drinkName: z.string(),
  drinkType: z.literal("hot").nullable(),
  orderSlip: z.string().nullable(),
  shotReady: z.string().nullable(),
  milkReady: z.string().nullable(),
  pickupCall: z.string().nullable(),
  lastError: z.string().nullable(),
  mergeMode: z.enum(MERGE_MODES),
});

export type ParallelState = z.infer<typeof parallelStateSchema>;

export type Station = {
  id: NodeId;
  label: string;
  reads: Array<keyof ParallelState>;
  writes: Array<keyof ParallelState>;
};

export type EdgeRow = {
  from: NodeId;
  to: NodeId;
  condition: string;
  readsField: string | null;
};

export const STATIONS: Station[] = [
  { id: "takeOrder", label: "点单", reads: ["drinkName"], writes: ["orderSlip", "drinkType", "mergeMode"] },
  { id: "fork", label: "分流（浓缩 ∥ 打奶）", reads: ["orderSlip", "mergeMode"], writes: ["shotReady", "milkReady", "lastError"] },
  { id: "assemble", label: "组装", reads: ["shotReady", "milkReady"], writes: ["pickupCall"] },
  { id: "okEnd", label: "完成", reads: ["pickupCall"], writes: [] },
  { id: "failEnd", label: "无法制作", reads: ["lastError"], writes: [] },
];

export const EDGES: EdgeRow[] = [
  { from: "takeOrder", to: "fork", condition: "无条件", readsField: null },
  { from: "fork", to: "assemble", condition: "shotReady 且 milkReady 都有值", readsField: "shotReady" },
  { from: "fork", to: "failEnd", condition: "合错或一侧空", readsField: "lastError" },
  { from: "assemble", to: "okEnd", condition: "无条件", readsField: null },
];

export const PARALLEL_ARMS = [
  { id: "brewShot", label: "出浓缩", writes: "shotReady", reads: "orderSlip" },
  { id: "steamMilk", label: "打奶", writes: "milkReady", reads: "orderSlip" },
];

export function isLegalEdge(from: NodeId, to: NodeId): boolean {
  return EDGES.some((row) => row.from === from && row.to === to);
}

export function stationOf(id: NodeId): Station {
  const hit = STATIONS.find((row) => row.id === id);
  if (!hit) throw new Error(`未知节点：${id}`);
  return hit;
}

export function pickFields(state: ParallelState, keys: Array<keyof ParallelState>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[String(key)] = state[key];
  return out;
}

export function isTerminal(node: NodeId): boolean {
  return node === "okEnd" || node === "failEnd";
}

export function mergeModeOf(drinkName: string): MergeMode {
  return drinkName.includes("合错") ? "whole" : "own";
}

export function takeOrderNode(state: ParallelState): Pick<ParallelState, "orderSlip" | "drinkType" | "mergeMode" | "lastError"> {
  return {
    drinkType: "hot",
    mergeMode: mergeModeOf(state.drinkName),
    orderSlip: "中杯热拿铁。浓缩和热奶没有互相依赖，可以同时做。",
    lastError: null,
  };
}

export function brewShotPatch(state: ParallelState): Partial<ParallelState> {
  if (state.mergeMode === "whole") {
    return { shotReady: "浓缩好了。", milkReady: state.milkReady };
  }
  return { shotReady: "浓缩好了。" };
}

export function steamMilkPatch(state: ParallelState): Partial<ParallelState> {
  if (state.mergeMode === "whole") {
    return { milkReady: "奶打好了。", shotReady: state.shotReady };
  }
  return { milkReady: "奶打好了。" };
}

export function assembleNode(state: ParallelState): Pick<ParallelState, "pickupCall"> {
  const num = `A${state.orderId.slice(-2)}`;
  return { pickupCall: `${num} 号请到取餐口。浓缩和热奶都齐了，热拿铁好了。` };
}

export const NODE_FNS: Record<Exclude<NodeId, "okEnd" | "failEnd" | "fork">, (state: ParallelState) => Partial<ParallelState>> = {
  takeOrder: takeOrderNode,
  assemble: assembleNode,
};

export function pickRoute(from: NodeId, state: ParallelState): { to: NodeId; condition: string; readsField: string | null } {
  const outs = EDGES.filter((row) => row.from === from);
  if (outs.length === 0) throw new Error(`节点 ${from} 没有出边`);
  if (from === "fork") {
    if (state.shotReady && state.milkReady) {
      const hit = outs.find((row) => row.to === "assemble");
      if (!hit) throw new Error("边表缺少 fork → assemble");
      return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
    }
    const hit = outs.find((row) => row.to === "failEnd");
    if (!hit) throw new Error("边表缺少 fork → failEnd");
    return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
  }
  if (outs.length !== 1) throw new Error(`节点 ${from} 有多条出边但没有写路由条件`);
  const only = outs[0];
  return { to: only.to, condition: only.condition, readsField: only.readsField };
}

export function graphSnapshot(): {
  stations: Station[];
  edges: EdgeRow[];
  parallelArms: typeof PARALLEL_ARMS;
} {
  return { stations: STATIONS, edges: EDGES, parallelArms: PARALLEL_ARMS };
}

export const NODE_PSEUDO: Record<string, string> = {
  takeOrder: `function takeOrder(state) {
  return { drinkType: "hot", mergeMode: 名字带「合错」? "whole" : "own", orderSlip };
}`,
  brewShot: `function brewShot(state) {
  // 合得对：只 return { shotReady }
  // 合错：return 里还带着 milkReady: null，合并时会把打奶盖掉
  return state.mergeMode === "whole"
    ? { shotReady: "浓缩好了。", milkReady: state.milkReady }
    : { shotReady: "浓缩好了。" };
}`,
  steamMilk: `function steamMilk(state) {
  return state.mergeMode === "whole"
    ? { milkReady: "奶打好了。", shotReady: state.shotReady }
    : { milkReady: "奶打好了。" };
}`,
  assemble: `function assemble(state) {
  return { pickupCall: 取餐号 + "浓缩和热奶都齐了" };
}`,
};

export const ROUTE_PSEUDO = `function route(currentNode, state) {
  if (currentNode === "takeOrder") return "fork";
  if (currentNode === "fork") {
    if (state.shotReady && state.milkReady) return "assemble";
    return "failEnd";
  }
  if (currentNode === "assemble") return "okEnd";
}`;

export const SCHEDULER_PSEUDO = `function step(state) {
  if (state.currentNode === "fork") {
    const shot = brewShot(state);  // 只应写 shotReady
    const milk = steamMilk(state); // 只应写 milkReady
    const patch = { ...shot, ...milk };
    const next = patch.shotReady && patch.milkReady ? "assemble" : "failEnd";
    return { ...state, ...patch, currentNode: next };
  }
  ① 跑当前站  ② 问路由  ③ 验边  ④ 写下 currentNode
}`;
