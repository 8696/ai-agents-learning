/**
 * 职责：咖啡店图。点单分流；制作可回边；机器故障写 lastError 立刻走失败边。
 * 数据流：drinkType 分流；做坏则 retryCount+1 回本站；热饮机坏了则不回边、retryCount 不动。
 * 为什么单独成文件：图的形状和「走一步」调度器分开。
 */
import { z } from "zod";

export const NODE_IDS = ["takeOrder", "brewHot", "brewIced", "serve", "okEnd", "failEnd"] as const;
export type NodeId = (typeof NODE_IDS)[number];
export const DRINK_TYPES = ["hot", "iced", "unknown"] as const;
export type DrinkType = (typeof DRINK_TYPES)[number];
export const MAX_BREW_ATTEMPTS = 3;
export const NODE_FAIL_MARK = "热饮机故障";

export function isNodeFailure(lastError: string | null): boolean {
  return Boolean(lastError && lastError.includes(NODE_FAIL_MARK));
}

export const cafeStateSchema = z.object({
  orderId: z.string().min(1),
  currentNode: z.enum(NODE_IDS),
  drinkName: z.string(),
  drinkType: z.enum(DRINK_TYPES).nullable(),
  orderSlip: z.string().nullable(),
  cupLabel: z.string().nullable(),
  pickupCall: z.string().nullable(),
  lastError: z.string().nullable(),
  retryCount: z.number().int().min(0),
});

export type CafeState = z.infer<typeof cafeStateSchema>;

export type Station = {
  id: NodeId;
  label: string;
  reads: Array<keyof CafeState>;
  writes: Array<keyof CafeState>;
};

export type EdgeRow = {
  from: NodeId;
  to: NodeId;
  condition: string;
  readsField: string | null;
};

export const STATIONS: Station[] = [
  {
    id: "takeOrder",
    label: "点单",
    reads: ["drinkName"],
    writes: ["orderSlip", "drinkType", "lastError"],
  },
  {
    id: "brewHot",
    label: "热饮制作",
    reads: ["orderSlip", "drinkName", "retryCount"],
    writes: ["cupLabel", "retryCount", "lastError"],
  },
  {
    id: "brewIced",
    label: "冰饮制作",
    reads: ["orderSlip", "drinkName", "retryCount"],
    writes: ["cupLabel", "retryCount", "lastError"],
  },
  {
    id: "serve",
    label: "出餐",
    reads: ["orderSlip", "cupLabel"],
    writes: ["pickupCall"],
  },
  {
    id: "okEnd",
    label: "完成",
    reads: ["pickupCall"],
    writes: [],
  },
  {
    id: "failEnd",
    label: "无法制作",
    reads: ["lastError"],
    writes: [],
  },
];

export const EDGES: EdgeRow[] = [
  { from: "takeOrder", to: "brewHot", condition: "drinkType === hot", readsField: "drinkType" },
  { from: "takeOrder", to: "brewIced", condition: "drinkType === iced", readsField: "drinkType" },
  { from: "takeOrder", to: "failEnd", condition: "drinkType === unknown", readsField: "drinkType" },
  { from: "brewHot", to: "serve", condition: "cupLabel 有值", readsField: "cupLabel" },
  { from: "brewHot", to: "failEnd", condition: "lastError 是热饮机故障", readsField: "lastError" },
  { from: "brewHot", to: "brewHot", condition: "杯盖空、未故障、retryCount < 3", readsField: "retryCount" },
  { from: "brewHot", to: "failEnd", condition: "杯盖空且 retryCount >= 3", readsField: "retryCount" },
  { from: "brewIced", to: "serve", condition: "cupLabel 有值", readsField: "cupLabel" },
  { from: "brewIced", to: "failEnd", condition: "lastError 是热饮机故障", readsField: "lastError" },
  { from: "brewIced", to: "brewIced", condition: "杯盖空、未故障、retryCount < 3", readsField: "retryCount" },
  { from: "brewIced", to: "failEnd", condition: "杯盖空且 retryCount >= 3", readsField: "retryCount" },
  { from: "serve", to: "okEnd", condition: "无条件", readsField: null },
];

export function isLegalEdge(from: NodeId, to: NodeId): boolean {
  return EDGES.some((row) => row.from === from && row.to === to);
}

export function stationOf(id: NodeId): Station {
  const hit = STATIONS.find((row) => row.id === id);
  if (!hit) throw new Error(`未知节点：${id}`);
  return hit;
}

export function pickFields(state: CafeState, keys: Array<keyof CafeState>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[String(key)] = state[key];
  return out;
}

export function classifyDrink(drinkName: string): Pick<CafeState, "drinkType" | "orderSlip" | "lastError"> {
  const said = drinkName;
  if (said.includes("冰") || said.includes("美式")) {
    return { drinkType: "iced", orderSlip: "大杯冰美式，单份浓缩，冰", lastError: null };
  }
  const looksHot = (said.includes("热") || said.includes("拿铁")) && !said.includes("抹茶");
  if (looksHot) {
    return { drinkType: "hot", orderSlip: "中杯热拿铁，双份浓缩，热", lastError: null };
  }
  return {
    drinkType: "unknown",
    orderSlip: `菜单上没有「${said}」。`,
    lastError: `菜单没有「${said}」，无法制作。不能默认送去热饮机。`,
  };
}

export function takeOrderNode(state: CafeState): Pick<CafeState, "orderSlip" | "drinkType" | "lastError"> {
  return classifyDrink(state.drinkName);
}

export function brewHotNode(state: CafeState): Pick<CafeState, "cupLabel" | "retryCount" | "lastError"> {
  return brewOnce(state, "hot");
}

export function brewIcedNode(state: CafeState): Pick<CafeState, "cupLabel" | "retryCount" | "lastError"> {
  return brewOnce(state, "iced");
}

function brewOnce(state: CafeState, kind: "hot" | "iced"): Pick<CafeState, "cupLabel" | "retryCount" | "lastError"> {
  if (state.drinkName.includes("热饮机坏")) {
    return {
      cupLabel: null,
      retryCount: state.retryCount,
      lastError: `${NODE_FAIL_MARK}：这一站执行失败。不把图摔死，也不回到制作站再试。`,
    };
  }
  if (state.drinkName.includes("做坏")) {
    const retryCount = state.retryCount + 1;
    return {
      cupLabel: null,
      retryCount,
      lastError: `第 ${retryCount} 次没做好。还在同一座制作站。`,
    };
  }
  const cupLabel = kind === "hot"
    ? `热杯。杯盖写着「${state.orderSlip}」。放在热饮区。`
    : `冰杯。杯盖写着「${state.orderSlip}」。加了冰块，放在冰饮区。`;
  return { cupLabel, retryCount: state.retryCount, lastError: null };
}

export function serveNode(state: CafeState): Pick<CafeState, "pickupCall"> {
  const num = `A${state.orderId.slice(-2)}`;
  return {
    pickupCall: `${num} 号请到取餐口，${state.orderSlip} 好了。`,
  };
}

export const NODE_FNS: Record<Exclude<NodeId, "okEnd" | "failEnd">, (state: CafeState) => Partial<CafeState>> = {
  takeOrder: takeOrderNode,
  brewHot: brewHotNode,
  brewIced: brewIcedNode,
  serve: serveNode,
};

export function isTerminal(node: NodeId): boolean {
  return node === "okEnd" || node === "failEnd";
}

export function graphSnapshot(): { stations: Station[]; edges: EdgeRow[] } {
  return { stations: STATIONS, edges: EDGES };
}

/** 读当前站 + State，从出边里挑一条。条件互斥且穷尽。 */
export function pickRoute(from: NodeId, state: CafeState): { to: NodeId; condition: string; readsField: string | null } {
  const outs = EDGES.filter((row) => row.from === from);
  if (outs.length === 0) {
    throw new Error(`节点 ${from} 没有出边`);
  }
  if (from === "takeOrder") {
    if (state.drinkType === "iced") {
      const hit = outs.find((row) => row.to === "brewIced");
      if (!hit) throw new Error("边表缺少 takeOrder → brewIced");
      return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
    }
    if (state.drinkType === "hot") {
      const hit = outs.find((row) => row.to === "brewHot");
      if (!hit) throw new Error("边表缺少 takeOrder → brewHot");
      return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
    }
    if (state.drinkType === "unknown") {
      const hit = outs.find((row) => row.to === "failEnd");
      if (!hit) throw new Error("边表缺少 takeOrder → failEnd");
      return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
    }
    throw new Error("点单后 drinkType 仍是空的，路由不穷尽。");
  }
  if (from === "brewHot" || from === "brewIced") {
    if (isNodeFailure(state.lastError)) {
      const hit = outs.find((row) => row.to === "failEnd" && row.readsField === "lastError");
      if (!hit) throw new Error(`边表缺少 ${from} → failEnd（节点失败）`);
      return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
    }
    if (state.cupLabel) {
      const hit = outs.find((row) => row.to === "serve");
      if (!hit) throw new Error(`边表缺少 ${from} → serve`);
      return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
    }
    if (state.retryCount < MAX_BREW_ATTEMPTS) {
      const hit = outs.find((row) => row.to === from);
      if (!hit) throw new Error(`边表缺少 ${from} → ${from} 回边`);
      return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
    }
    const hit = outs.find((row) => row.to === "failEnd" && row.readsField === "retryCount");
    if (!hit) throw new Error(`边表缺少 ${from} → failEnd（次数用尽）`);
    return { to: hit.to, condition: hit.condition, readsField: hit.readsField };
  }
  if (outs.length !== 1) {
    throw new Error(`节点 ${from} 有多条出边但没有写路由条件`);
  }
  const only = outs[0];
  return { to: only.to, condition: only.condition, readsField: only.readsField };
}

export const NODE_PSEUDO: Record<Exclude<NodeId, "okEnd" | "failEnd">, string> = {
  takeOrder: `function takeOrder(state) {
  // 读 drinkName，写出订单条 + 饮品类型（给路由用）
  // 菜单没有时写出 unknown，不要默认当成热饮
  return classifyDrink(state.drinkName);
}`,
  brewHot: `function brewHot(state) {
  // 「热饮机坏」写 lastError，retryCount 不动；「做坏」空杯 + 次数+1
  return brewOnce(state, "hot");
}`,
  brewIced: `function brewIced(state) {
  return brewOnce(state, "iced");
}`,
  serve: `function serve(state) {
  return { pickupCall: 取餐号 + state.orderSlip + " 好了" };
}`,
};

export const ROUTE_PSEUDO = `function route(currentNode, state) {
  if (currentNode === "takeOrder") {
    if (state.drinkType === "iced") return "brewIced";
    if (state.drinkType === "hot") return "brewHot";
    if (state.drinkType === "unknown") return "failEnd";
  }
  if (currentNode === "brewHot" || currentNode === "brewIced") {
    if (isNodeFailure(state.lastError)) return "failEnd";
    if (state.cupLabel) return "serve";
    if (state.retryCount < 3) return currentNode;
    return "failEnd";
  }
  if (currentNode === "serve") return "okEnd";
}`;

export const SCHEDULER_PSEUDO = `function step(state) {
  ① const patch = nodes[state.currentNode](state); // 丢掉 patch.currentNode
  ② const next = route(state.currentNode, { ...state, ...patch });
  ③ 验边：next 不在出边名单 → lastError，去 failEnd
  ④ return { ...state, ...patch, currentNode: next };
}`;
