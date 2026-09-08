/**
 * 职责：Tool 定义 · divide —— 除法（**Tool 抛错结构化演示** · 变体 4）。
 * 数据流：tool_use.input → Zod schema safeParse → handler(args) →
 *   - b === 0 → throw new Error("divide by zero")
 *   - 否则 → 返 { a, b, result }
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 4）：
 *   - **业务错误 ≠ 基础设施错误**：divide by zero 是**业务错误**（用户输入错），不该挂整轮 agent
 *   - **handler throw → koa 中间件捕获 → 结构化 tool_result**：registry.executeTool try/catch 把 Error 包装成 `{status:"error", code, message, retryable}`
 *   - **模型下轮能改输入**：错误带 `is_error:true` 回灌 Round 2 → 模型看到 → 改 b 重新调 divide(10, 2)
 *   - **不抛 HTTP 500**：整轮 agent 不挂，用户看到友好提示
 *
 * 日志（：每条调用 + handler throw + cache + audit 都打。
 */
import { z } from "zod";
import { logger } from "../logger.js";

export const divideTool = {
  name: "divide",
  description:
    "计算 a / b。**业务错误**（b=0）会抛异常 → 后端中间件捕获 → 返结构化 tool_result `{status:\"error\", code:\"DIVIDE_BY_ZERO\", message, retryable:false}` → 模型下轮可改输入。**不要抛 HTTP 500** —— 整轮 agent 不挂。",
  schema: z.object({
    a: z.coerce.number(),
    b: z.coerce.number(),
  }),
  // 除法不危险；Registry 闸放过
  dangerous: false,
  handler: (args: { a: number; b: number }): {
    kind: "ok";
    payload: Record<string, unknown>;
    hookTrace: never[];
  } => {
    if (args.b === 0) {
      logger.warn("divide.handler.throw", "b=0 触发业务错误", "divide by zero 是用户输入错，抛异常让 registry 中间件捕获", {
        a: args.a,
        b: args.b,
      });
      throw new Error("divide by zero: b 不能为 0");
    }
    const result = args.a / args.b;
    logger.info("divide.handler.ok", "除法成功", "a/b 返回", { a: args.a, b: args.b, result });
    return {
      kind: "ok",
      payload: { a: args.a, b: args.b, result },
      hookTrace: [],
    };
  },
};