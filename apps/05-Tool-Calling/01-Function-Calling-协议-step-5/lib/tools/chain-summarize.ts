/**
 * 职责：Tool 定义 · summarize —— 把搜到的内容按风格总结（mock）。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 一份契约；新增 Tool 不改 Registry 核心代码。
 *
 * step-4 关键差异：这是 chain 链 A → B 中的 B（下游）；handler 的 content 参数**必须**是 search_doc 的输出。
 *   路由层 hard-code：先 await search_doc 拿结果，再 await summarize({ content: search_doc.result })。
 *   这种"参数来自上一个 tool_result"的写法就是依赖链的物理形态（详 MD 例子 5）。
 *
 * handler sleep 50ms 模拟"本地 NLP 处理"。
 */
import { z } from "zod";

export const summarizeTool = {
  name: "summarize",
  description: "把内容按指定风格总结（mock，handler 故意 sleep 50ms 模拟本地 NLP 处理）；content 来自上一个 tool_call 的结果",
  schema: z.object({
    content: z.unknown(),  // 上游 search_doc 的 result（结构可变，这里只要求非 null）
    style: z.enum(["tech", "oneliner", "bullets"]),
  }),
  dangerous: false,
  handler: async (args: { content: unknown; style: string }) => {
    // 模拟"本地 NLP 摘要处理"：50ms
    await new Promise((r) => setTimeout(r, 50));
    const c = args.content as { query?: string; hits?: { title: string; snippet: string }[] };
    const hits = c?.hits ?? [];
    const query = c?.query ?? "(未知 query)";
    let summary: string;
    if (args.style === "tech") {
      summary = `【技术综述｜${query}】共 ${hits.length} 条核心要点：${hits.map((h) => h.snippet).join(" / ")}`;
    } else if (args.style === "oneliner") {
      summary = `${query} 的核心是让模型能"开口要"外部能力并把结果塞回对话历史。`;
    } else {
      summary = `· ${query} · 概念定义\n· ${query} · 实践要点（5 步协议）\· ${query} · 常见坑（description / 失败回灌 / 独立 IO 并行）`;
    }
    return {
      query,
      style: args.style,
      summary,
    };
  },
};