/**
 * 职责：对照实验用的两组 Tool 定义 —— A（差描述）vs B（好描述）。
 * 数据流：routes/compare.ts 拿这两组分别发给模型，对比模型选了哪个 Tool。
 *
 * 教学锚点（本条核心 —— 变体 1「触发条件」 + 变体 5「参数语义」）：
 *   - A 组：description 太短、太泛，没写「何时调」「何时别调」。
 *     模型看到一个 user query「我订单 X 还没到」，query_order 描述是「查订单」也能匹配上，
 *     模型就在两个都模糊的 Tool 里随机选。
 *   - B 组：description 写明触发条件（用户问物流 → 调物流）、反例（不要调订单详情）、
 *     字段语义（order_id 是订单号）。
 *     模型几乎总是稳定地选 query_logistics。
 *
 *   字段级 description（order_id.description）也是给模型看的；写「用户的订单号，如 '12345'」
 *   比只写「订单号」更不容易被模型错填（比如把 '12345' 拼成中文「一万两千三百四十五」）。
 *
 * 不调 LLM、不打日志：纯常量导出。
 */
import type { ToolSchema } from "../llm/protocol-a.js";

// ── A 组 · 差描述（baseline）──
//   描述太短 / 没触发条件 / 没反例 / 字段没 description —— 教学反例
const BASELINE_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "query_order",
      description: "查订单",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_logistics",
      description: "查物流",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
        },
        required: ["order_id"],
      },
    },
  },
];

// ── B 组 · 好描述（improved）──
//   描述带触发条件 + 反例 + 字段语义；对照 A 组看模型选择是否变稳定
const IMPROVED_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "query_order",
      description:
        "查询订单的静态详情：订单状态（已付款/已发货/已签收）、金额、收货地址、下单时间。用于回答「我的订单什么状态」「订单多少钱」「寄到哪个地址」之类问题。不要用于查物流轨迹 / 快递位置 —— 那是 query_logistics 的事。",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "用户的订单号，纯数字或字母数字混合，例如 '12345'、'ORD-2026-0007'。",
          },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_logistics",
      description:
        "查询订单的物流轨迹 / 快递当前位置。用于回答「我的快递到哪了」「我的包裹什么状态」「快递怎么还没到」「我的订单怎么还没收到」之类问题。不要用于查订单状态 / 金额 / 地址 —— 那是 query_order 的事。",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "用户的订单号，纯数字或字母数字混合，例如 '12345'、'ORD-2026-0007'。",
          },
        },
        required: ["order_id"],
      },
    },
  },
];

/** 期望的 Tool 名（用于 verdict 判定）。 */
function pickExpectedTool(query: string): string | null {
  const q = query.toLowerCase();
  // 先 order：更明确（地址/金额/状态/收货 = 想知道订单静态信息），且词组不会出现在 logistics 类 query
  if (/地址|寄到|金额|状态|收货|订单详情|订单什么|多少钱|订单状态|收货地址|寄到哪|寄到哪个/.test(q)) return "query_order";
  // 后 logistics：快递/包裹/配送/物流类词组；用复合词避免「到」单字误伤 order
  if (/快递|包裹|派送|送货|签收|轨迹|物流|没到|没收到|到哪了|到哪儿|几天没到|几天没收到/.test(q)) return "query_logistics";
  // 其它（边界）：两个 Tool 都不该调
  return null;
}

/** 一次对照实验的输入：A 组 tools、B 组 tools、user query。 */
export type CompareInput = {
  query: string;
};

/** 一次对照实验的输出：两侧 LLM 调用的 request/response + 判定。 */
export type CompareSide = {
  label: string;            // 「差描述 / 好描述」给前端展示用
  tools: ToolSchema[];      // 这一侧发给模型的 tools（前端可视化用）
  request: ProtocolARequestForLog; // 这一侧发出去的完整 request（前端可视化用）
  response: ProtocolAResponseForLog; // 这一侧的完整 response（前端可视化用）
  /** true = LLM 调用成功；false = LLM 调用失败（catch 路径） */
  ok: boolean;
  /** 模型选了哪个 Tool；null = 模型没调 tool；undefined = LLM 失败 */
  pickedToolName: string | null | undefined;
  /** 模型填的参数（JSON.parse 后的对象） */
  pickedToolArgs: unknown;
  /** 本次调用耗时（ms），含 LLM 出网 */
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

export function getBaselineTools(): ToolSchema[] {
  return BASELINE_TOOLS;
}

export function getImprovedTools(): ToolSchema[] {
  return IMPROVED_TOOLS;
}

export function getExpectedToolForLogisticsQuery(): string {
  // 兼容旧调用路径；实际判定走 pickExpectedTool(query)
  return "query_logistics";
}

export { pickExpectedTool };
