/**
 * 职责：本 Demo 注册的 4 个 mock Tool（calculator / weather / db / search）。
 * 数据流：模块加载时 defineTool → registry；handler 只在 Zod 通过后执行。
 * 为什么单独成文件：改某个 Tool 的 schema/行为时不必翻 Registry 实现。
 *
 * 特殊约定：lookup_user("u999") 故意抛错，给「工具执行失败」场景用。
 */
import { z } from "zod";
import { defineTool } from "./registry.js";

defineTool({
  name: "add",
  description:
    "把两个数字相加，返回 { sum: number }。a / b 都是 number（含整数和小数）。",
  input: z.object({ a: z.number(), b: z.number() }),
  handler: async ({ a, b }) => ({ sum: a + b }),
});

defineTool({
  name: "get_weather",
  description: "查某城市当前天气（mock 数据），返回 { city, temp_c, condition }。",
  input: z.object({ city: z.string().min(1) }),
  handler: async ({ city }) => ({
    city,
    temp_c: city === "北京" ? 25 : 22,
    condition: "晴",
  }),
});

defineTool({
  name: "lookup_user",
  description:
    "按 user_id 查用户信息（mock 数据库），返回 { id, name, level, points }。user_id 形如 u001。",
  input: z.object({
    // regex 的报错文案会原样回灌给模型，所以写成它能照着改的话，而不是 "Invalid"
    user_id: z
      .string()
      .regex(/^u\d+$/, "user_id 必须形如 u001（u 开头 + 数字）"),
  }),
  handler: async ({ user_id }) => {
    // u999 形式合法（Zod 会放行），失败发生在执行阶段 ——
    // 这正是「参数非法」与「下游故障」两种失败的分界，pages/tool-error.html 演示它
    if (user_id === "u999") {
      throw new Error("数据库连接超时（mock 故意抛错）");
    }
    // level 给串行场景用：下一轮的 add 要拿它当入参
    return { id: user_id, name: "测试用户", level: 3, points: 1200 };
  },
});

defineTool({
  name: "search_wiki",
  description: "查 wiki 摘要（mock 数据），返回 { title, summary }。query 至少 2 个字符。",
  input: z.object({ query: z.string().min(2) }),
  handler: async ({ query }) => ({
    title: query,
    summary: `${query} 是一段 mock 摘要（仅用于演示 search 类 tool 的返回结构）。`,
  }),
});
