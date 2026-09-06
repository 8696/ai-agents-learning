/**
 * 职责：Tool 定义 · suggest_items —— 根据天气概率给打包建议（依赖 get_weather 的 rain_prob）。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 一份契约；新增 Tool 不改 Registry 核心代码。
 *
 * step-7 关键差异（vs step-5）：这是混合编排两步链的"下游"，**严格依赖** get_weather 的 rain_prob。
 *   路由层 hard-code 约束 1（拒绝越权）：模型直接调 suggest_items 但 get_weather 还没跑 → 路由层拒绝，
 *     把 error 当 tool_result 回灌 → 模型下一轮看到 error 决定先调 get_weather。
 *   路由层 hard-code 约束 2（路径 B 硬接）：用户问"带不带伞" → 模型调 get_weather → final →
 *     路由层自动再调 suggest_items（用 get_weather.result.rain_prob 派生参数）。
 *   handler sleep 40ms 模拟本地 NLP 处理。
 */
import { z } from "zod";

export const suggestItemsTool = {
  name: "suggest_items",
  description: "根据雨季概率给打包建议（mock，handler 故意 sleep 40ms）；rain_prob 必须来自上一个 get_weather tool_result（路由层 hard-code 约束）",
  schema: z.object({
    items: z.array(z.string()).min(1),
    rain_prob: z.number().min(0).max(1),
  }),
  dangerous: false,
  handler: async (args: { items: string[]; rain_prob: number }) => {
    // 模拟"本地 NLP 打包建议"：40ms
    await new Promise((r) => setTimeout(r, 40));
    const advice: string[] = [];
    if (args.rain_prob >= 0.6) {
      advice.push("雨季概率高，必带折叠伞 + 防水鞋套");
      advice.push("冲锋衣 / 防泼水外套");
    } else if (args.rain_prob >= 0.3) {
      advice.push("雨季概率中等，带把折叠伞以防万一");
    } else {
      advice.push("雨季概率低，常规出行即可");
    }
    // 基础项（与请求 items 合并）
    const baseItems = args.items;
    return {
      requested_items: baseItems,
      rain_prob: args.rain_prob,
      advice,
      summary: `雨季概率 ${args.rain_prob}：${advice.join("；")}。基础项：${baseItems.join("、")}。`,
    };
  },
};