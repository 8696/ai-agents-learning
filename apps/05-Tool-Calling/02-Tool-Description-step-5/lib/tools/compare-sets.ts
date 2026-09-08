/**
 * 职责：对照实验用的两组 Tool 定义 —— A（描述无反例）vs B（描述含反例「Do not use for X」）。
 * 数据流：routes/compare.ts 拿这两组分别发给模型，看 user 问订单详情时模型是否瞎调 query_logistics。
 *
 * 教学锚点（变体 3「反例」）：
 *   - A 组：query_logistics.description = 「查询订单的物流轨迹」（简单描述、无反例）。
 *     当 user 问「我的订单寄到哪个地址」（订单详情类 query），model 看到描述里出现「订单」「物流」
 *     关键词，可能把 query 当成物流问题 → 瞎调 query_logistics（即使应该不调）。
 *   - B 组：query_logistics.description 加一句「不要用于查订单状态/金额/地址 —— 那是订单详情问题」。
 *     反例把语义相近的 Tool 调错拦下 → model 识别为不该调 → 用自然语言回应「这是查订单详
情，
 *     不是查物流」。
 *
 *   工具列表缩到 1 个（query_logistics），去掉 query_order —— 因为 query_order 是「订单详情」
 *   对应的正确 Tool；如果放进去，模型可能调 query_order（对），那就看错反例了。
 *   真正的对照：user 问订单详情 → A 组瞎调 query_logistics（错）/ B 组不调任何 Tool（对）。
 *
 * 不调 LLM、不打日志：纯常量导出。
 */
import type { ToolSchema } from "../llm/protocol-a.js";

// ── A 组 · priority 字段无 enum（baseline）──
//   priority.description 写明含义但 schema 只 type:string → 模型瞎填任意值（不在 enum）
const BASELINE_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "query_logistics",
      description:
        "查询订单的物流轨迹。用于回答「我的快递到哪了」「我的包裹什么状态」「快递怎么还没到」之类问题。" +
        "**不要用于查订单状态 / 金额 / 收货地址 —— 那是订单详情的问题，不归本工具管。**",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "用户的订单号（即快递单号/tracking number）",
          },
          priority: {
            type: "string",
            description: "用户的紧急程度（自定义文本，例如「急」「中」「不急」等）",
          },
        },
        required: ["order_id"],
      },
    },
  },
];

// ── B 组 · priority 字段用 enum 限定合法值（improved）──
//   schema "enum": ["low", "medium", "high"] → 模型必须填 enum 内值
const IMPROVED_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "query_logistics",
      description:
        "查询订单的物流轨迹。用于回答「我的快递到哪了」「我的包裹什么状态」「快递怎么还没到」之类问题。" +
        "**不要用于查订单状态 / 金额 / 收货地址 —— 那是订单详情的问题，不归本工具管。**",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "用户的订单号（即快递单号/tracking number）",
          },
          priority: {
            type: "string",
            // Tool parameters 类型不显式支持 enum；强转保留 enum 便于 LLM 看提示
            ...({ enum: ["low", "medium", "high"] } as Record<string, unknown>),
            description: "用户的紧急程度：low=不急 / medium=一般 / high=很急（必须填 enum 内值）",
          },
        },
        required: ["order_id"],
      },
    },
  },
];

/** 单次对照实验的输出：两侧 LLM 调用的 request/response + 判定。 */
export type CompareSide = {
  label: string;
  tools: ToolSchema[];
  request: ProtocolARequestForLog;
  response: ProtocolAResponseForLog;
  ok: boolean;
  pickedToolName: string | null | undefined;
  pickedToolArgs: unknown;
  elapsedMs: number;
};

export type ProtocolARequestForLog = {
  model: string;
  messages: { role: string; content: string | null }[];
  tools?: ToolSchema[];
  tool_choice?: string;
};

export type ProtocolAResponseForLog = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string | null; tool_calls?: ChatMsgToolCallForLog[] };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

export type ChatMsgToolCallForLog = {
  id: string;
  type: string;
  function: { name: string; arguments: string };
};

/**
 * step-3 识破类型：模型没调 Tool 但 content 说明了原因
 *   "neg"     = 反例生效（content 说「这是订单详情，不是物流」类）
 *   "missing"  = 缺字段识破（content 说「没提供订单号，请告诉我」类）
 *   "both"     = 两种原因都提到
 *   "none"     = pickedToolName=null 但 content 没说明原因（罕见：模型识破但没说为什么）
 */
export type DetectType = "neg" | "missing" | "both" | "none";

const NEG_KEYWORDS = [
  "订单详情", "不是物流", "不归本工具", "那是订单", "那是 order", "订单地址", "收货地址",
  "order detail", "this is for", "not for logistics", "查订单详情", "order information",
];

const MISSING_KEYWORDS = [
  "没有提供", "请提供", "需要提供", "没提供", "缺订单号", "需要订单号", "无法查询",
  "请告诉我", "询问", "please provide", "需要您提供", "需要 user 提供", "需要订单",
];

export function detectRecognizeReason(content: string | null | undefined): DetectType {
  if (!content) return "none";
  const s = String(content).toLowerCase();
  const hitNeg = NEG_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
  const hitMissing = MISSING_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
  if (hitNeg && hitMissing) return "both";
  if (hitNeg) return "neg";
  if (hitMissing) return "missing";
  return "none";
}

/** 兼容旧名：只要 content 提到「反例」或「缺字段」就算识破（不区分类型） */
export function contentMentionsDetect(content: string | null | undefined): boolean {
  const d = detectRecognizeReason(content);
  return d === "neg" || d === "missing" || d === "both";
}

export function getBaselineTools(): ToolSchema[] {
  return BASELINE_TOOLS;
}

export function getImprovedTools(): ToolSchema[] {
  return IMPROVED_TOOLS;
}