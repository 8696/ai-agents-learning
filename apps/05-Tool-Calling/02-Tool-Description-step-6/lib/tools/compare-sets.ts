/**
 * 职责：step-6 跨 Provider 兼容用的 Tool 定义 —— 两侧用同一份最佳 schema（含反例+别名+enum）。
 * 数据流：routes/compare.ts 拿 getImprovedTools() 分别发给协议 A 和协议 B，看两家 Provider 是否一致。
 *
 * 教学锚点（变体 6「跨 Provider 兼容」）：
 *   - step-6 只用 getImprovedTools()：同一份 schema 走 OpenAI + Anthropic
 *   - 控制变量 = Provider（OpenAI vs Anthropic），不是 description 质量差异
 *   - schema 已含 step-3 反例 + step-2 别名映射 + step-5 enum —— 验证「综合最优写法跨 Provider 可迁移」
 *   - BASELINE_TOOLS 仅供对照参考（step-6 不使用），保留以复用 CompareSide 类型
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
            "enum": ["low", "medium", "high"],
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