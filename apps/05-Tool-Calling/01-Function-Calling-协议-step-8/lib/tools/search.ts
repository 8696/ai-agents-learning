/**
 * 职责：Tool 定义 · search —— 在知识库里搜关键词。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 */
import { z } from "zod";

export const searchTool = {
  name: "search",
  description: "在知识库里搜关键词，返回命中结果列表",
  schema: z.object({ query: z.string().min(1) }),
  dangerous: false,
  handler: (args: { query: string }) => {
    return {
      query: args.query,
      results: [
        { title: `${args.query} · 维基百科`, url: `https://example.com/wiki/${encodeURIComponent(args.query)}` },
        { title: `${args.query} · 知乎`, url: `https://example.com/zhihu/${encodeURIComponent(args.query)}` },
        { title: `${args.query} · 官方文档`, url: `https://example.com/docs/${encodeURIComponent(args.query)}` },
      ],
    };
  },
};
