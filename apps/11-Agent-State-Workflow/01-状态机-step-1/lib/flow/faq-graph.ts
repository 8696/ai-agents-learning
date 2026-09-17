/**
 * 职责：内部 FAQ 线性图——节点、边、每站读/写哪些字段、三站本地函数。
 * 数据流：调度器按 currentNode 找到节点函数 → 写出字段 → 再按边表找下一站。
 * 为什么单独成文件：图的形状和「走一步」调度器分开，打开本文件就能看见整张交通图。
 */
import { z } from "zod";

export const NODE_IDS = ["rewrite", "retrieve", "generate", "okEnd"] as const;
export type NodeId = (typeof NODE_IDS)[number];

export const faqStateSchema = z.object({
  ticketId: z.string().min(1),
  currentNode: z.enum(NODE_IDS),
  userQuestion: z.string(),
  rewrittenQuery: z.string().nullable(),
  hits: z.array(z.string()).nullable(),
  replyDraft: z.string().nullable(),
});

export type FaqState = z.infer<typeof faqStateSchema>;

export type Station = {
  id: NodeId;
  label: string;
  reads: Array<keyof FaqState>;
  writes: Array<keyof FaqState>;
};

export type EdgeRow = {
  from: NodeId;
  to: NodeId;
  condition: string;
  readsField: string | null;
};

/** 四站流水线。完成站没有出边。 */
export const STATIONS: Station[] = [
  {
    id: "rewrite",
    label: "改写问题",
    reads: ["userQuestion"],
    writes: ["rewrittenQuery"],
  },
  {
    id: "retrieve",
    label: "检索",
    reads: ["rewrittenQuery"],
    writes: ["hits"],
  },
  {
    id: "generate",
    label: "生成答案",
    reads: ["rewrittenQuery", "hits"],
    writes: ["replyDraft"],
  },
  {
    id: "okEnd",
    label: "完成",
    reads: ["replyDraft"],
    writes: [],
  },
];

/** 边表（画法第 9 步）。这一步全是无条件，后面加分流时只改这里。 */
export const EDGES: EdgeRow[] = [
  { from: "rewrite", to: "retrieve", condition: "无条件", readsField: null },
  { from: "retrieve", to: "generate", condition: "无条件", readsField: null },
  { from: "generate", to: "okEnd", condition: "无条件", readsField: null },
];

const FAQ_HITS: Array<{ keywords: string[]; text: string }> = [
  {
    keywords: ["退货", "退款", "到账"],
    text: "退货申请通过后，退款一般 3～7 个工作日原路返回。",
  },
  {
    keywords: ["退货", "取消", "未发货"],
    text: "商品未发货时取消订单，退款通常比已发货退货更快到账。",
  },
];

export function stationOf(id: NodeId): Station {
  const hit = STATIONS.find((row) => row.id === id);
  if (!hit) throw new Error(`未知节点：${id}`);
  return hit;
}

export function pickFields(state: FaqState, keys: Array<keyof FaqState>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[String(key)] = state[key];
  return out;
}

export function rewriteNode(state: FaqState): Pick<FaqState, "rewrittenQuery"> {
  const cleaned = state.userQuestion
    .replace(/[？?！!。，,、]/g, " ")
    .replace(/要|吗|呢|啊/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { rewrittenQuery: cleaned || state.userQuestion };
}

export function retrieveNode(state: FaqState): Pick<FaqState, "hits"> {
  const query = state.rewrittenQuery ?? "";
  const hits = FAQ_HITS.filter((row) => row.keywords.some((word) => query.includes(word))).map(
    (row) => row.text,
  );
  return { hits: hits.length > 0 ? hits : [FAQ_HITS[0].text] };
}

export function generateNode(state: FaqState): Pick<FaqState, "replyDraft"> {
  const hits = state.hits ?? [];
  const lines = hits.map((text, index) => `${index + 1}. ${text}`).join("\n");
  return {
    replyDraft: `根据内部知识库：\n${lines}\n\n结论：退货申请通过后，退款一般 3～7 个工作日到账。`,
  };
}

export const NODE_FNS: Record<Exclude<NodeId, "okEnd">, (state: FaqState) => Partial<FaqState>> = {
  rewrite: rewriteNode,
  retrieve: retrieveNode,
  generate: generateNode,
};

export function isTerminal(node: NodeId): boolean {
  return node === "okEnd";
}

export function graphSnapshot(): { stations: Station[]; edges: EdgeRow[] } {
  return { stations: STATIONS, edges: EDGES };
}
