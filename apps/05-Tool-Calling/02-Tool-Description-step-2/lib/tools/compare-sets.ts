/**
 * 职责：对照实验用的两组 Tool 定义 —— A（字段无 description）vs B（字段有 description）。
 * 数据流：routes/compare.ts 拿这两组分别发给模型，对比模型填 order_id 参数的方式。
 *
 * 教学锚点（变体 2「参数语义」）：
 *   - A 组：Tool description 跟 B 组一样，但 order_id 字段只有 type: string、无 description。
 *     模型看到 user 说「在北京下的订单」时，order_id 是 string 类型 → 模型瞎填一个字符串
 *     进去，最容易把城市名「北京」当订单号（city→order_id 映射错误）。
 *   - B 组：order_id.description 写明「用户的订单号，纯数字或字母数字混合，例如 '12345'、
 *     'ORD-2026-0007'。不接受城市名等非订单号输入。」 → 模型看到字段 description 就知道
 *     不能填城市名，要么问 user 要，要么填一个占位符「unknown / 待确认」等。
 *
 *   工具 description 跟 step-1 不一样：step-1 测的是 tool 级（用哪个 Tool），step-2 测的是
 *   field 级（参数填什么）。所以这里 Tool 数量缩到 1（query_logistics），去掉 query_order
 *   干扰；user query 也改成「在北京下的订单」—— user 没明确给订单号，故意引诱模型瞎填。
 *
 * 不调 LLM、不写日志：纯常量导出。
 */
import type { ToolSchema } from "../llm/protocol-a.js";

// ── A 组 · 字段无 description（baseline）──
//   Tool 描述 + 参数 schema 的 type 都跟 B 组一样；唯一差异 = order_id 字段没 description
const BASELINE_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "query_logistics",
      description: "查询订单的物流轨迹",
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

// ── B 组 · 字段有 description（improved）──
//   Tool 描述跟 A 组一样；order_id.description 写明「不接受城市名」
const IMPROVED_TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "query_logistics",
      description: "查询订单的物流轨迹",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description:
              "用户的订单号，纯数字或字母数字混合，例如 '12345'、'ORD-2026-0007'。" +
              "**不接受城市名等非订单号输入**；如果 user 没明确说订单号，应让 user 提供具体订单号，不要瞎填。",
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
  if (/物流|快递|轨迹|到哪|没到|没收到|几天|派送|送货|签收/.test(q)) return "query_logistics";
  if (/地址|寄到|金额|状态|收货|订单详情|订单什么|多少钱|订单状态/.test(q)) return "query_order";
  return null;
}

/** 判定「参数瞎填了城市名」—— 本 step 唯一的核心判定。 */
const CITY_KEYWORDS = [
  "北京", "上海", "深圳", "杭州", "广州", "南京", "苏州", "成都",
  "beijing", "shanghai", "shenzhen", "hangzhou", "guangzhou",
  "BJ", "SH", "SZ", "HZ", "GZ", "NJ",
  "京", "沪", "粤", "浙",
];

function isBadCityArg(args: unknown): boolean {
  if (typeof args !== "object" || args === null) return false;
  const oid = (args as Record<string, unknown>).order_id;
  if (typeof oid !== "string") return false;
  const s = oid.toLowerCase();
  return CITY_KEYWORDS.some((k) => s.includes(k.toLowerCase()));
}

/** 一次对照实验的输入：A 组 tools、B 组 tools、user query。 */
export type CompareInput = {
  query: string;
};

/** 一次对照实验的输出：两侧 LLM 调用的 request/response + 判定。 */
export type CompareSide = {
  label: string;
  tools: ToolSchema[];
  request: ProtocolARequestForLog;
  response: ProtocolAResponseForLog;
  /** true = LLM 调用成功（不论模型选没选 tool_call）；false = LLM 调用失败（catch 路径） */
  ok: boolean;
  /** 模型选了哪个 Tool；null = 模型没调 tool（自然语言回应）；undefined = LLM 调用失败 */
  pickedToolName: string | null | undefined;
  /** 模型填的参数 */
  pickedToolArgs: unknown;
  /** 本次调用耗时（ms），含 LLM 真发网络请求 */
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

export { pickExpectedTool, isBadCityArg };
