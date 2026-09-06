/**
 * 职责：Tool 定义 · calc —— 数学表达式计算。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 *
 * step-8 简化：calc 标 dangerous: false。
 *   理由：step-8 的教学锚点是"模型拿到 tool_result 后的回复是否引用了真数字"；
 *   如果 calc 仍 dangerous，模型想调它但被 gateway 拦 → tool_result 是 { ok:false, error } → 没法演示数字引用。
 *   真实场景 calc 必须 dangerous（详见 step-2 calc.ts 的注释 + 模块 20 安全卡片）。
 */
import { z } from "zod";

export const calcTool = {
  name: "calc",
  description: "数学表达式计算（step-8 简化标 safe；真实场景必须 dangerous + 人工审批）",
  schema: z.object({ expression: z.string().min(1) }),
  // step-8 简化：false 让模型真能用 → tool_result 有 result 数字 → 才能演示"reply 是否引用"
  // step-2 / step-5 / step-7 仍 true，保留 gateway 拦截的教学锚点
  dangerous: false,
  handler: (args: { expression: string }) => {
    // mock：真实场景是 mathjs.evaluate 或自写 parser；绝不要 `eval(args.expression)`
    return { expression: args.expression, result: 42 };
  },
};
