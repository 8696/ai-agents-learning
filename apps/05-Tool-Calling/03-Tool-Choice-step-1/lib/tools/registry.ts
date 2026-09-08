/**
 * 职责：本条固定 tools 定义（唯一变量应是 tool_choice，不是 description）。
 * 数据流：registry → routes/choice 拼进 chat.completions.create({ tools, tool_choice })。
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions";

/** 物流查询：description 写清触发条件，方便 auto 在「查快递」query 下稳定调 */
export const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "query_logistics",
      description:
        "查询快递物流轨迹。用户问快递到哪了、派送状态、几天能到时调用。需要订单号 order_id。不要用于查退款或改地址。",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "用户的订单号（即快递单号 / tracking number）",
          },
        },
        required: ["order_id"],
        additionalProperties: false,
      },
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) =>
  t.type === "function" ? t.function.name : "(unknown)",
);
