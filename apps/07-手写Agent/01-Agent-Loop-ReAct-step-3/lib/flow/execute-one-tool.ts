/**
 * 职责：执行一个 tool_call，并把 Observe 写进 messages（含本条五条日志）。
 *
 * 数据流：
 *   tool_call（name + arguments JSON）
 *     → 查 registry → parse args → handler
 *       → messages.push({ role: "tool", tool_call_id, content })
 *         → 返回 toolResult + elapsedMs 给 loop 记进 trajectory / 算并行耗时
 *
 * 为什么单独成文件：查表 / 跑 handler / 写回 Observe 是「做一次工具」。
 * loop.ts 的 Act 阶段用 Promise.all 并行 map 调本函数。
 * 失败 Observe（变体 G）：handler 返回 {ok:false,...} 时原样写进 tool 消息，这里不 throw、不改 content。
 */

import { logger } from "../logger.js";
import { todoToolRegistry } from "../tools/todo-tools.js";
import type { ChatMessage, ToolCallLite, TrajectoryStep } from "./types.js";

export type ToolResult = TrajectoryStep["toolResults"][number];

export type ExecuteOneToolSettled = {
  toolResult: ToolResult;
  elapsedMs: number;
};

export async function executeOneTool(
  call: ToolCallLite,
  messages: ChatMessage[],
): Promise<ExecuteOneToolSettled> {
  const tTool0 = Date.now();
  const handler = todoToolRegistry.handlers.get(call.function.name);
  if (!handler) {
    const content = JSON.stringify({ ok: false, error: "unknown_tool", name: call.function.name });
    messages.push({ role: "tool", tool_call_id: call.id, content });
    logger.warn("││ 调用函数-execute", "调用函数结束：" + call.function.name + "（失败）",
      "为什么写这条日志：模型调了一个 registry 里没有的工具；必须把错误当 Observe 写回 messages，让模型下一圈能修正。当前：本 tool_call 写错误进 tool 消息。",
      { tool_call_id: call.id, name: call.function.name, 错误: "unknown_tool" });
    return {
      toolResult: {
        tool_call_id: call.id,
        name: call.function.name,
        arguments: safeParseArgs(call.function.arguments),
        content,
      },
      elapsedMs: Date.now() - tTool0,
    };
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = safeParseArgs(call.function.arguments);
  } catch (err: unknown) {
    const content = JSON.stringify({ ok: false, error: "args_parse_failed", message: (err as Error).message });
    messages.push({ role: "tool", tool_call_id: call.id, content });
    logger.warn("││ 调用函数-execute", "调用函数结束：" + call.function.name + "（失败）",
      "为什么写这条日志：模型给的 arguments 不是合法 JSON —— 不抛、塞回 Observe；变体 G 雏形。当前：tool_call_id=" + call.id,
      { tool_call_id: call.id, name: call.function.name, 错误: "args_parse_failed", error: err });
    return {
      toolResult: {
        tool_call_id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
        content,
      },
      elapsedMs: Date.now() - tTool0,
    };
  }

  try {
    const { content } = await handler(call.function.arguments);
    messages.push({ role: "tool", tool_call_id: call.id, content });
    const elapsedMs = Date.now() - tTool0;
    logger.info("││ 调用函数-" + call.function.name, "调用函数结束：" + call.function.name,
      "为什么写这条日志：要把返回值塞回 messages 当 Observe，让模型下一圈能读。变体 E 并行：本 tool_call 跟其它 tool_call 同时执行，耗时是它自己的，不是整圈相加。当前：tool 消息已追加。",
      { tool_call_id: call.id, 入参: { tool_call_id: call.id, arguments: parsedArgs }, 返回值: content, 耗时ms: elapsedMs, __code: "const { content } = await handler(JSON.stringify(parsedArgs));" });
    return {
      toolResult: {
        tool_call_id: call.id,
        name: call.function.name,
        arguments: parsedArgs,
        content,
      },
      elapsedMs,
    };
  } catch (err: unknown) {
    const content = JSON.stringify({ ok: false, error: "tool_threw", message: (err as Error).message });
    messages.push({ role: "tool", tool_call_id: call.id, content });
    const elapsedMs = Date.now() - tTool0;
    logger.error("││ 调用函数-" + call.function.name, "调用函数结束：" + call.function.name + "（失败）",
      "为什么写这条日志：handler throw 了 —— 必须把错误当 Observe 写回，不能让 Loop 死掉（变体 G）。变体 E 并行：本 tool_call 跟其它同时执行。当前：tool 消息已写错误。",
      { tool_call_id: call.id, 入参: { tool_call_id: call.id, arguments: parsedArgs }, error: err, 耗时ms: elapsedMs });
    return {
      toolResult: {
        tool_call_id: call.id,
        name: call.function.name,
        arguments: parsedArgs,
        content,
      },
      elapsedMs,
    };
  }
}

function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { __raw: raw };
  }
}
