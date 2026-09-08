/**
 * 职责：固定单 Tool（物流），突出「开关改的是 Choice，不是 Description」。
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
];

export const TOOL_NAMES = ["query_logistics"];
