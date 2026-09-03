/**
 * 职责：并行执行一轮里的多个 tool_call；以及把结果转成可 append 的 messages。
 * 数据流：tool_calls[] → Promise.all(executeOne) → ToolResultOut[] → role:tool messages。
 */
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import { executeOneToolCall } from "./execute-one-tool-call.js";
import type { ToolResultOut } from "./round-types.js";

/** 无依赖的多个 tool_call 必须并行，否则「并行调用」教学点看不见。 */
export async function executeToolCalls(
  toolCalls: ChatCompletionMessageToolCall[],
): Promise<ToolResultOut[]> {
  return Promise.all(toolCalls.map((tc) => executeOneToolCall(tc)));
}

export function toolResultsToMessages(
  results: ToolResultOut[],
): ChatCompletionMessageParam[] {
  return results.map((r) => ({
    role: "tool" as const,
    tool_call_id: r.tool_call_id,
    content: r.content,
  }));
}
