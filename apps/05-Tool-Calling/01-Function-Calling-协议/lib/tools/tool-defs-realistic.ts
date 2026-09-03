/**
 * 职责：本 Demo「差旅助手」场景的 5 个 mock Tool。
 * 数据流：模块加载时 defineTool → registry；handler 只在 Zod 通过后执行。
 * 为什么单独成文件：和 tool-defs.ts 是两个独立业务流，旧 4 个 tool
 *   （add / get_weather / lookup_user / search_wiki）保留不变。
 *
 * 故意命名加 trip_ 前缀 = 避开 tool-defs.ts 的 get_weather 重名。
 * run-realistic.ts 用 SYSTEM_PROMPT_REALISTIC 引导模型「只调 trip_*」，
 * 旧 run.html / serial.html 的 system prompt 仍引导旧 4 个，两边互不干扰。
 */
import { z } from "zod";
import { defineTool } from "./registry.js";

defineTool({
  name: "trip_weather",
  description:
    "查某城市当前天气（mock 数据），返回 { city, temp_c, condition }。city 形如「东京」「北京」。",
  input: z.object({ city: z.string().min(1) }),
  handler: async ({ city }) => ({
    city,
    temp_c: city === "东京" ? 22 : 18,
    condition: city === "东京" ? "晴" : "多云",
  }),
});

defineTool({
  name: "trip_exchange",
  description:
    "查货币汇率（mock 数据），返回 { base, target, rate }。rate = 1 单位 base 换多少 target。",
  input: z.object({
    base: z.string().min(3),
    target: z.string().min(3),
  }),
  handler: async ({ base, target }) => {
    // 只 mock 几对常见汇率，其它按 1.0 占位 —— 让 Zod 校验通过，
    // 但模型依然要按真实场景填参数（这就是 Tool Description 教学的现场）
    const known: Record<string, number> = {
      CNY_JPY: 21.0,
      CNY_USD: 0.14,
      CNY_EUR: 0.13,
      CNY_GBP: 0.11,
    };
    const key = `${base}_${target}`;
    const rate = known[key] ?? 1.0;
    return { base, target, rate };
  },
});

defineTool({
  name: "trip_attractions",
  description:
    "查某城市的景点列表（mock 数据），返回 { city, items: [{ name, type }] }。top_n 默认 3，最多 10。",
  input: z.object({
    city: z.string().min(1),
    // 模型偶尔会把数字字段填成字符串 "3"——z.coerce.number() 内部 Number(v) 转一下；
    // undefined 也接受（返回 3 当默认）。非法值如 "abc" 仍走 Zod ✗ 路径。
    top_n: z.coerce.number().int().min(1).max(10).default(3),
  }),
  handler: async ({ city, top_n }) => {
    const all: Record<string, Array<{ name: string; type: string }>> = {
      东京: [
        { name: "浅草寺", type: "寺庙" },
        { name: "东京塔", type: "地标" },
        { name: "上野公园", type: "公园" },
        { name: "秋叶原", type: "商圈" },
        { name: "筑地市场", type: "美食" },
      ],
      北京: [
        { name: "故宫", type: "历史" },
        { name: "长城", type: "历史" },
        { name: "颐和园", type: "园林" },
      ],
    };
    const items = (all[city] ?? [{ name: `${city}中央公园`, type: "通用" }]).slice(
      0,
      top_n,
    );
    return { city, items };
  },
});

defineTool({
  name: "trip_flights",
  description:
    "查航班价格（mock 数据），返回 { from, to, date, options: [{ carrier, price_cny, duration_h }] }。",
  input: z.object({
    from_city: z.string().min(1),
    to_city: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date 必须 YYYY-MM-DD"),
  }),
  handler: async ({ from_city, to_city, date }) => ({
    from: from_city,
    to: to_city,
    date,
    options: [
      { carrier: "国航", price_cny: 4200, duration_h: 3.5 },
      { carrier: "全日空", price_cny: 5100, duration_h: 3.2 },
      { carrier: "廉价航空", price_cny: 2800, duration_h: 4.5 },
    ],
  }),
});

defineTool({
  name: "trip_hotels",
  description:
    "查酒店（mock 数据），返回 { city, nights, options: [{ name, stars, total_cny }] }。total_cny 已按 nights 算好。",
  input: z.object({
    city: z.string().min(1),
    nights: z.number().int().min(1).max(30),
    per_night_cny_budget: z.number().int().min(100),
  }),
  handler: async ({ city, nights, per_night_cny_budget }) => {
    // 三档：经济 / 中端 / 高端，按预算挑选「最接近」的一档
    const tiers = [
      { name: `${city}经济旅馆`, stars: 2, per_night: 350 },
      { name: `${city}商务酒店`, stars: 3, per_night: 700 },
      { name: `${city}精品酒店`, stars: 4, per_night: 1400 },
    ];
    const options = tiers.map((t) => ({
      name: t.name,
      stars: t.stars,
      total_cny: t.per_night * nights,
      fits_budget: t.per_night <= per_night_cny_budget,
    }));
    return { city, nights, options };
  },
});