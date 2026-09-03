/**
 * 职责：协议 B 的「Structured Output 等价路径」——强制 tool_choice 调 Intent。
 * 数据流：{ llm, prompt } → tools + tool_choice → content[type=tool_use].input → Zod。
 * 为什么单独成文件：input 已经是对象，无须 JSON.parse。这是和协议 A content 字符串最大的差别。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { INTENT_TOOL } from "../schema/intent.js";
import type { ModeCallResult, ToolUseMeta } from "./measure-types.js";
import { analyzeObject, safeParseIntentObject } from "./parse-and-analyze.js";

export async function runToolUseForced(llm: Llm, prompt: string): Promise<ModeCallResult> {
  const t0 = performance.now();

  const res = await llm.anthropic.messages.create({
    model: llm.modelB,
    max_tokens: llm.maxTokensB,
    system: "按用户的意图返回结构化结果。遇到模糊请求，从工具描述里的三类动作中选最贴近的。",
    tools: [INTENT_TOOL],
    // ① tool_choice 强制必须调 "Intent"——这是协议 B 的语义闸（没有 token-mask）。
    tool_choice: { type: "tool", name: "Intent" },
    messages: [{ role: "user", content: prompt }],
  });

  // ② 强制 tool_use 时，input 已经按 input_schema 解析好。模型偶尔会先说一段 text，忽略即可。
  let inputObj: unknown = null;
  let usedToolBlock: ToolUseMeta | null = null;
  for (const block of res.content) {
    if (block.type === "tool_use") {
      usedToolBlock = { id: block.id, name: block.name };
      inputObj = block.input;
    }
  }

  const rawJson = JSON.stringify(inputObj, null, 2);
  console.log(
    `  /api/tool-use tool_use: ${usedToolBlock?.name ?? "(无)"} · input: ${rawJson.slice(0, 300)}${rawJson.length > 300 ? "..." : ""}`,
  );

  // ③ 仍然 Zod：input_schema 是倾向，不是硬闸。prompt 强引导可能写出 enum 外的值。
  const parsedResult = safeParseIntentObject(inputObj);

  return {
    mode: "tool_use_forced",
    raw: rawJson,
    parseOk: parsedResult.ok,
    parsed: parsedResult.ok ? parsedResult.data : null,
    parseError: parsedResult.ok ? null : parsedResult.error,
    analysis: analyzeObject(inputObj, parsedResult, prompt),
    toolUse: usedToolBlock,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
