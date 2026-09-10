/**
 * 职责：把「待办助手」业务包成 OpenAI function-calling 协议可识别的两个 Tool 定义。
 *
 * 数据流：
 *   loop.ts 拿到 llm 返回的 tool_calls（name + arguments JSON）
 *     → 到这里查 registries.get(name)
 *       → 校验 arguments（用每个 tool 自带的 Zod schema）
 *         → 调对应 handler → 拿到返回值（list / complete 的结果数组或单条）
 *           → 返回给 loop 当 observe
 *
 * 为什么单独成文件：Tool 定义 = 协议形状 + handler 入口；与 todo-data（事实）和 loop（控制流）正交。
 * 后面 step 加变体 E 并行 / G 失败 / 自纠 / 校验失败 → 在本文件加 Tool 或加校验分支即可，loop 不动。
 *
 * 本条覆盖变体：D 串行依赖（complete 依赖 list 给的 id）+ F 成功 Observe。
 * 故意**不**演示：E 并行 / G 失败 Observe / 自纠 / Zod 校验失败 → step-2+ 加（参考 MD 需求 2/3/4）。
 */

import { z } from "zod";
import { listTodos, completeTodo, type ListFilter, type Todo } from "./todo-data.js";

// ── OpenAI function-calling 的「工具定义」形状：type/function.name/function.description/function.parameters ──
export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON Schema；用 zod-to-jsonSchema 不值得（小本条 2 个 tool），直接手写。 */
    parameters: Record<string, unknown>;
  };
};

export type ToolHandler = (argsJson: string) => Promise<{
  /** OpenAI Messages API tool 消息的 content；失败也走这条（变体 G 留 step-2） */
  content: string;
}>;

// ── list_todos ──
const listArgsSchema = z.object({
  tag: z.enum(["购物", "工作", "健身"]).optional(),
  onlyOverdue: z.boolean().optional(),
});

const listTodosDef: ToolDefinition = {
  type: "function",
  function: {
    name: "list_todos",
    description:
      "列出待办；可按 tag 过滤（购物 / 工作 / 健身），onlyOverdue=true 时仅返回「未完成且已逾期」的条目。返回数组。",
    parameters: {
      type: "object",
      properties: {
        tag: {
          type: "string",
          enum: ["购物", "工作", "健身"],
          description: "可选；按 tag 过滤",
        },
        onlyOverdue: {
          type: "boolean",
          description: "可选；true = 仅返回未完成且 dueDate 早于今天的条目",
        },
      },
      additionalProperties: false,
    },
  },
};

const listTodosHandler: ToolHandler = async (argsJson: string) => {
  const parsed = listArgsSchema.safeParse(JSON.parse(argsJson || "{}"));
  if (!parsed.success) {
    // 故意：业务失败观察（变体 G）留给 step-2；step-1 假定模型给的参数合法
    throw new Error(`list_todos 参数不合法：${parsed.error.issues.map(i => i.message).join("；")}`);
  }
  const filter: ListFilter = parsed.data;
  const rows: Todo[] = listTodos(filter);
  return {
    content: JSON.stringify({ count: rows.length, todos: rows }),
  };
};

// ── complete_todo ──
const completeArgsSchema = z.object({
  id: z.string().min(1, "id 不能为空"),
});

const completeTodoDef: ToolDefinition = {
  type: "function",
  function: {
    name: "complete_todo",
    description: "把指定 id 的待办标记为已完成；返回更新后的那条。不存在则返回 not_found（让模型改 id 重试）。",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "待办 id，形如 todo-001" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
};

const completeTodoHandler: ToolHandler = async (argsJson: string) => {
  const parsed = completeArgsSchema.safeParse(JSON.parse(argsJson || "{}"));
  if (!parsed.success) {
    throw new Error(`complete_todo 参数不合法：${parsed.error.issues.map(i => i.message).join("；")}`);
  }
  const updated = completeTodo(parsed.data.id);
  if (!updated) {
    // 变体 G 雏形：业务失败 → 返回 not_found 而非 throw；step-2 再正式做 Observe 错误通道
    return { content: JSON.stringify({ ok: false, error: "not_found", id: parsed.data.id }) };
  }
  return { content: JSON.stringify({ ok: true, todo: updated }) };
};

// ── Registry：loop.ts 用 name 查 ──
export const todoToolRegistry: {
  definitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
} = {
  definitions: [listTodosDef, completeTodoDef],
  handlers: new Map([
    [listTodosDef.function.name, listTodosHandler],
    [completeTodoDef.function.name, completeTodoHandler],
  ]),
};
