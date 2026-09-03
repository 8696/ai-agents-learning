/**
 * 职责：Tool 定义 · get_weather —— 查某城市天气。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 是一份契约（定义 + 校验 + 执行），新增 Tool 不改 Registry 核心代码。
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
  // 危险标志：false 表示 gateway 放行；true 必须人工授权（参考模块 20 安全卡片）。
  dangerous: false,
  handler: (args: { city: string }) => {
    const w = data[args.city] ?? { temp: 22, sky: "未知" };
    return { city: args.city, ...w };
  },
};