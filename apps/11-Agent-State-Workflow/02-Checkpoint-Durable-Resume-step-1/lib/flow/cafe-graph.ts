/**
 * 职责：这一步用的咖啡店主图——点单 → 扣会员卡 → 热饮/冰饮制作 → 发取餐短信 → 出餐。
 * 数据流：start 写入 drinkName → 每走一步跑当前节点 → 路由改 currentNode。
 * 为什么单独成文件：图的规则和「写入检查点」分开，存档器（Checkpointer）不掺进点单规则。
 *
 * 扣会员卡这一站会调本地支付渠道（payment-ledger）。同一幂等键（Idempotency Key）只扣一次钱。
 * 发短信这一站仍只改状态字段，本步不演示短信渠道。
 */
import { chargeMemberCard } from "./payment-ledger.js";

export const NODE_IDS = [
  "takeOrder",
  "chargeCard",
  "brewHot",
  "brewIced",
  "sendPickupSms",
  "serve",
  "okEnd",
] as const;
export type NodeName = (typeof NODE_IDS)[number];

export const NODE_LABELS: Record<NodeName, string> = {
  takeOrder: "点单（takeOrder）",
  chargeCard: "扣会员卡（chargeCard）",
  brewHot: "热饮制作（brewHot）",
  brewIced: "冰饮制作（brewIced）",
  sendPickupSms: "发取餐短信（sendPickupSms）",
  serve: "出餐（serve）",
  okEnd: "完成（okEnd）",
};

export const EDGES: Record<NodeName, NodeName[]> = {
  takeOrder: ["chargeCard"],
  chargeCard: ["brewHot", "brewIced"],
  brewHot: ["sendPickupSms"],
  brewIced: ["sendPickupSms"],
  sendPickupSms: ["serve"],
  serve: ["okEnd"],
  okEnd: [],
};

export interface CafeState {
  currentNode: NodeName;
  drinkName: string;
  drinkType: "" | "hot" | "iced";
  orderSlip: string;
  cardBalance: number;
  chargedAmount: number;
  executedToolCallIds: string[];
  brewOk: boolean;
  brewNote: string;
  smsSent: boolean;
  pickupCode: string;
  served: boolean;
  completedNodes: NodeName[];
}

export function createInitialState(drinkName: string): CafeState {
  return {
    currentNode: "takeOrder",
    drinkName: drinkName.trim(),
    drinkType: "",
    orderSlip: "",
    cardBalance: 50,
    chargedAmount: 0,
    executedToolCallIds: [],
    brewOk: false,
    brewNote: "",
    smsSent: false,
    pickupCode: "",
    served: false,
    completedNodes: [],
  };
}

export function takeOrder(state: CafeState): Partial<CafeState> {
  const hot = state.drinkName.includes("热");
  return {
    drinkType: hot ? "hot" : "iced",
    orderSlip: (hot ? "热饮单：" : "冰饮单：") + state.drinkName,
  };
}

export function chargeCard(state: CafeState, runId: string): Partial<CafeState> {
  const amount = 18;
  const payment = chargeMemberCard({ runId, amount });
  return {
    cardBalance: payment.ledgerBalance,
    chargedAmount: payment.amount,
    executedToolCallIds: [...state.executedToolCallIds, "charge-card"],
  };
}

export function brewHot(): Partial<CafeState> {
  return { brewOk: true, brewNote: "热饮做好了" };
}

export function brewIced(): Partial<CafeState> {
  return { brewOk: true, brewNote: "冰饮做好了" };
}

export function sendPickupSms(state: CafeState): Partial<CafeState> {
  return {
    smsSent: true,
    pickupCode: "A17",
    executedToolCallIds: [...state.executedToolCallIds, "send-pickup-sms"],
  };
}

export function serve(): Partial<CafeState> {
  return { served: true };
}

export function routeAfter(from: NodeName, state: CafeState): NodeName {
  if (from === "takeOrder") return "chargeCard";
  if (from === "chargeCard") return state.drinkType === "hot" ? "brewHot" : "brewIced";
  if (from === "brewHot" || from === "brewIced") return "sendPickupSms";
  if (from === "sendPickupSms") return "serve";
  if (from === "serve") return "okEnd";
  return "okEnd";
}

export function isLegalEdge(from: NodeName, to: NodeName): boolean {
  return EDGES[from].includes(to);
}

export function isTerminal(node: NodeName): boolean {
  return node === "okEnd";
}

export type NodeFn = (state: CafeState, runId: string) => Partial<CafeState>;

export const NODES: Record<NodeName, NodeFn> = {
  takeOrder: (state) => takeOrder(state),
  chargeCard,
  brewHot: () => brewHot(),
  brewIced: () => brewIced(),
  sendPickupSms: (state) => sendPickupSms(state),
  serve: () => serve(),
  okEnd: () => ({}),
};
