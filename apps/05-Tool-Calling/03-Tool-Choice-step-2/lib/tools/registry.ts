/**
 * 职责：本条固定双 Tool（物流 + 天气）—— 唯一变量是 tool_choice 形态，不是 description。
 * 数据流：registry → routes/force 拼进 chat.completions.create。
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_logistics",
      description:
        "查询快递物流轨迹。用户问快递到哪了、派送状态时调用。需要订单号 order_id。",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "用户的订单号（即快递单号）",
          },
        },
        required: ["order_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "查询城市天气。用户问今天天气、气温、下雨吗时调用。需要城市名 city。",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "城市名，如深圳、上海",
          },
        },
        required: ["city"],
        additionalProperties: false,
      },
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) =>
  t.type === "function" ? t.function.name : "(unknown)",
);

export const FORCEABLE_NAMES = ["query_logistics", "get_weather"] as const;
export type ForceableName = (typeof FORCEABLE_NAMES)[number];
