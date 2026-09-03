/**
 * 职责：Tool Registry（name → ToolDef）+ 导出给模型 / 前端的视图。
 * 数据流：
 *   defineTool → Map
 *   buildOpenAITools → chat.completions 的 tools 字段
 *   listToolsForUi → GET /tools
 * 为什么：新增 Tool 只改 tool-defs.ts，不改 loop / routes。
 */
import { zodToJsonSchema } from "../schema/zod-to-json-schema.js";
import type { ToolDef } from "./tool-types.js";

// any：Map 里各 Tool 的 P 各不相同，存进来必然要擦掉泛型；
// 取出来时由 executeOneToolCall 用该 Tool 自己的 Zod schema 重新收紧类型。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const registry = new Map<string, ToolDef<any>>();

export function defineTool<P>(tool: ToolDef<P>): ToolDef<P> {
  // 重名直接崩：同名工具会让模型的 tool_call 指向不确定的实现，宁可启动就失败
  if (registry.has(tool.name)) throw new Error(`Tool ${tool.name} 已注册`);
  registry.set(tool.name, tool);
  return tool;
}

/** 系统提示：告诉模型有哪些工具、别瞎猜。 */
export const SYSTEM_PROMPT =
  "你可以使用工具（add / get_weather / lookup_user / search_wiki）。能用工具完成的不要直接猜。";

/**
 * 请求体里的 tools 字段。模型对工具的全部认知就这三样：
 * name（回给我们的标识）、description（什么时候该调）、parameters（怎么填参数）。
 */
export function buildOpenAITools() {
  return Array.from(registry.values()).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.input),
    },
  }));
}

/** 给总览页看的同一份信息 —— 页面上看到什么，模型就看到什么，不做美化。 */
export function listToolsForUi() {
  return Array.from(registry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    jsonSchema: zodToJsonSchema(t.input),
  }));
}
