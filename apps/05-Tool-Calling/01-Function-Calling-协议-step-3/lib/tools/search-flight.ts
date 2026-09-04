/**
 * 职责：Tool 定义 · search_flight —— 查某月去某地的机票价格。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 一份契约；新增 Tool 不改 Registry 核心代码。
 *
 * step-3 关键差异（对比 step-1/2）：handler 是 **async**（含 `await sleep(...)` 模拟真实 IO）；
 *   这样 Promise.all 真有"等待多个异步"的物理行为，gantt 时序图才能画出 3 个 bar 同时起步。
 */
import { z } from "zod";

export const searchFlightTool = {
  name: "search_flight",
  description: "查询某月去某地的机票价格（mock，handler 故意 sleep 80ms 模拟真实 IO）",
  schema: z.object({
    to: z.string().min(1),
    month: z.coerce.number().int().min(1).max(12),
  }),
  dangerous: false,
  handler: async (args: { to: string; month: number }) => {
    // ① 模拟"远端机票 API 往返"：80ms（比 weather/packing 都慢）
    await new Promise((r) => setTimeout(r, 80));
    return {
      to: args.to,
      month: args.month,
      price_cny: 3500,
      airline: "Mock Air",
    };
  },
};
