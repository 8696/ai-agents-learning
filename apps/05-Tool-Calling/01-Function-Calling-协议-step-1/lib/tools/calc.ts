/**
 * 职责：Tool 定义 · calc —— 数学表达式计算。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 一份契约；calc 标 `dangerous: true` 作为 Gateway 拦截的教学锚点。
 */
import { z } from "zod";

export const calcTool = {
  name: "calc",
  description: "数学表达式计算（危险工具：未经审核 gateway 必须拦）",
  schema: z.object({ expression: z.string().min(1) }),
  // 教学点：本条 Gateway 检查的关键 —— dangerous 工具不直接执行。
  // 生产里还要做的事：限制 expression 长度、禁用 `eval` / `Function`、白名单 token 集。
  dangerous: true,
  handler: (args: { expression: string }) => {
    // mock：真实场景是 mathjs.evaluate 或自写 parser；绝不要 `eval(args.expression)`
    return { expression: args.expression, result: 42 };
  },
};