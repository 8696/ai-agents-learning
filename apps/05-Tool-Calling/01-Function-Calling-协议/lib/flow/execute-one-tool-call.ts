/**
 * 职责：执行「一个」tool_call 的完整三步（查表 → parse/Zod → handler）。
 * 数据流：ChatCompletionMessageToolCall → ToolResultOut；任何失败都变成 content，不抛。
 * 为什么：loop / 并行只编排，不重复写失败分支。
 */
import { performance } from "node:perf_hooks";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { registry } from "../tools/registry.js";
import { buildToolResult } from "./build-tool-result.js";
import { parseToolArgsJson, validateToolArgs } from "./parse-and-validate-args.js";
import type { ToolResultOut } from "./round-types.js";

export async function executeOneToolCall(
  tc: ChatCompletionMessageToolCall,
): Promise<ToolResultOut> {
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const toolName = tc.function.name;
  //  // 打 tc 完整 SDK 结构（含 id / type / function 全字段）—— 长度超 800 截前
  const tcJson = JSON.stringify(tc);
  console.log(
    `  │     · ${toolName} 开始 · tc=${tcJson.length > 800 ? tcJson.slice(0, 800) + "…(截)" : tcJson}`,
  );

  // ① 查表：模型可能幻觉出一个根本没注册的工具名，这里必须挡住
  const tool = registry.get(toolName);
  if (!tool) {
    console.log(`  │     · ${toolName} ✗ 未知工具`);
    return buildToolResult({
      toolCallId: tc.id,
      toolName,
      content: `未知工具 ${toolName}`,
      parseOk: false,
      executeOk: false,
      rawArgs: null,
      durationMs: ms(),
    });
  }

  // ② arguments 是字符串，先 JSON.parse；模型偶尔会吐出截断或带反引号的伪 JSON
  const parsedJson = parseToolArgsJson(tc.function.arguments);
  if (!parsedJson.ok) {
    console.log(
      `  │     · ${toolName} ✗ JSON.parse 失败 · ${ms()}ms · err=${parsedJson.errorContent.slice(0, 120)}`,
    );
    return buildToolResult({
      toolCallId: tc.id,
      toolName,
      content: parsedJson.errorContent,
      parseOk: false,
      executeOk: false,
      rawArgs: parsedJson.rawArgs,
      durationMs: ms(),
    });
  }

  // ③ Zod：合法 JSON ≠ 合法参数。校验必须在 handler 之前，非法参数一律不打到真实服务
  const validated = validateToolArgs(tool.input, parsedJson.data);
  if (!validated.ok) {
    console.log(
      `  │     · ${toolName} ✗ Zod 校验失败 · ${ms()}ms · err=${validated.errorContent.slice(0, 120)}`,
    );
    return buildToolResult({
      toolCallId: tc.id,
      toolName,
      content: validated.errorContent,
      parseOk: false,
      executeOk: false,
      rawArgs: parsedJson.rawArgs,
      durationMs: ms(),
    });
  }

  // ④ handler：真正执行。throw 写成 executeOk=false 回灌给模型，
  //    不 rethrow —— 一个工具超时不该让整轮对话 500
  try {
    const out = await tool.handler(validated.data);
    const contentStr = JSON.stringify(out);
    console.log(
      `  │     · ${toolName} ✓ · ${ms()}ms · content=${contentStr.slice(0, 200)}${contentStr.length > 200 ? "…" : ""}`,
    );
    return buildToolResult({
      toolCallId: tc.id,
      toolName,
      content: contentStr,
      parseOk: true,
      executeOk: true,
      rawArgs: parsedJson.rawArgs,
      durationMs: ms(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  │     · ${toolName} ✗ 执行 throw · ${ms()}ms · err=${msg.slice(0, 120)}`);
    return buildToolResult({
      toolCallId: tc.id,
      toolName,
      content: `执行失败: ${msg}`,
      parseOk: true,
      executeOk: false,
      rawArgs: parsedJson.rawArgs,
      durationMs: ms(),
    });
  }
}
