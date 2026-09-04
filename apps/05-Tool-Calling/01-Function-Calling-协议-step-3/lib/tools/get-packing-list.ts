/**
 * 职责：Tool 定义 · get_packing_list —— 按季节返回打包清单。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 一份契约；新增 Tool 不改 Registry 核心代码。
 *
 * step-3 关键差异：handler 是 async（30ms sleep，最快）—— Promise.all 时它先完成。
 */
import { z } from "zod";

export const getPackingListTool = {
  name: "get_packing_list",
  description: "按季节返回打包清单（mock，handler 故意 sleep 30ms 模拟本地 IO）",
  schema: z.object({
    season: z.enum(["spring", "summer", "autumn", "winter"]),
  }),
  dangerous: false,
  handler: async (args: { season: string }) => {
    await new Promise((r) => setTimeout(r, 30));
    const items: Record<string, string[]> = {
      spring: ["薄外套", "雨伞", "长袖 T 恤"],
      summer: ["短袖", "防晒霜", "墨镜"],
      autumn: ["毛衣", "围巾", "长裤"],
      winter: ["羽绒服", "手套", "暖宝宝"],
    };
    return {
      season: args.season,
      items: items[args.season] ?? ["通用：护照、充电器、转换插头"],
    };
  },
};
