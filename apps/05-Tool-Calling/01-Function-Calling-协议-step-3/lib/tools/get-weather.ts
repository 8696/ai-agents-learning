/**
 * 职责：Tool 定义 · get_weather —— 查某城市某月平均天气。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 一份契约；新增 Tool 不改 Registry 核心代码。
 *
 * step-3 关键差异：handler 是 async（50ms sleep）—— Promise.all 才能看到 3 个 bar 同时起步。
 */
import { z } from "zod";

export const getWeatherTool = {
  name: "get_weather",
  description: "查询某城市某月平均天气（mock，handler 故意 sleep 50ms 模拟远端 API）",
  schema: z.object({
    city: z.string().min(1),
    month: z.coerce.number().int().min(1).max(12),
  }),
  dangerous: false,
  handler: async (args: { city: string; month: number }) => {
    await new Promise((r) => setTimeout(r, 50));
    return {
      city: args.city,
      month: args.month,
      temp_c: 22,
      rain_prob: 0.3,
    };
  },
};
