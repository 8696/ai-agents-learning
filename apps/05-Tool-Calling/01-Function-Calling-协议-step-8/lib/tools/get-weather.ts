/**
 * 职责：Tool 定义 · get_weather —— 查某城市天气。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 */
import { z } from "zod";

const data: Record<string, { temp: number; sky: string }> = {
  北京: { temp: 25, sky: "晴" },
  上海: { temp: 30, sky: "多云" },
  深圳: { temp: 32, sky: "雷阵雨" },
  杭州: { temp: 28, sky: "阴" },
};

export const getWeatherTool = {
  name: "get_weather",
  description: "查询某城市某天的天气，返回 { temp, sky }",
  schema: z.object({ city: z.string().min(1) }),
  dangerous: false,
  handler: (args: { city: string }) => {
    const w = data[args.city] ?? { temp: 22, sky: "未知" };
    return { city: args.city, ...w };
  },
};
