/**
 * 职责：Tool 定义 · get_weather —— mock 查城市某月的天气概率（独立 IO · 路由层 hard-code 链的"上游"）。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 一份契约；新增 Tool 不改 Registry 核心代码。
 *
 * step-7 关键差异（vs step-5）：这是混合编排两步链的"上游"；
 *   路由层 hard-code 约束：suggest_items 必须在 get_weather 之后调（rain_prob 来自这里）。
 *   模型决定要不要进这条链（路径 A 仅调这一个 / 路径 B + 路径 C 都要先调它）。
 *   handler sleep 60ms 模拟远端天气 API。
 */
import { z } from "zod";

export const getWeatherTool = {
  name: "get_weather",
  description: "查指定城市某月的天气统计（mock，handler 故意 sleep 60ms 模拟远端 API）；返回 rain_prob（雨季概率 0~1）、avg_temp（平均气温 ℃）、month",
  schema: z.object({
    city: z.string().min(1),
    month: z.number().int().min(1).max(12),
  }),
  dangerous: false,
  handler: async (args: { city: string; month: number }) => {
    // 模拟"远端天气 API"：60ms
    await new Promise((r) => setTimeout(r, 60));
    // 演示用：5 月东京雨季概率 0.7、平均 22°C（呼应 step-3 mock 数据，让 step-3 / step-7 数据有连贯感）
    // 其他城市 / 月份用伪随机派生（确定性：基于 city 长度 + month）
    const seed = args.city.length + args.month;
    const rain_prob = Number((0.3 + (seed % 7) * 0.1).toFixed(2));
    const avg_temp = 15 + (seed % 12);
    return {
      city: args.city,
      month: args.month,
      rain_prob,
      avg_temp,
      note: `${args.city} ${args.month} 月雨季概率 ${rain_prob}，平均气温 ${avg_temp}°C`,
    };
  },
};