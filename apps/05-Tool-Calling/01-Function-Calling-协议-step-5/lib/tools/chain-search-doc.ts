/**
 * 职责：Tool 定义 · search_doc —— 在本地知识库里搜关键词（mock）。
 * 数据流：tool_call.arguments → Zod schema safeParse → handler(args) → tool_result。
 * 为什么单独成文件：每个 Tool 一份契约；新增 Tool 不改 Registry 核心代码。
 *
 * step-4 关键差异（vs step-3）：这是 chain 链 A → B 中的 A（上游）；handler sleep 80ms 模拟真实 IO；
 *   handler 返回的结果会被路由层塞进下一个 tool_call 的 content 参数（B = summarize）。
 */
import { z } from "zod";

export const searchDocTool = {
  name: "search_doc",
  description: "在本地知识库里搜关键词，返回命中 3 条摘要（mock，handler 故意 sleep 80ms 模拟远端 API）",
  schema: z.object({
    query: z.string().min(1),
  }),
  dangerous: false,
  handler: async (args: { query: string }) => {
    // 模拟"远端文档检索 API"：80ms
    await new Promise((r) => setTimeout(r, 80));
    // ── 自纠触发条件（两种）：
    //   ① query 太短（< 3 字符）→ 返空 hits → 模型自纠扩 query
    //   ② query 含 "❌" 标记（教学演示）→ 始终返空 → 演示 MAX_ROUNDS 触发
    if (args.query.includes("❌") || args.query.length < 3) {
      return { query: args.query, hits: [] as { title: string; snippet: string }[] };
    }
    return {
      query: args.query,
      hits: [
        { title: `${args.query} · 概念定义`, snippet: `${args.query} 是 Agent 开发的核心协议，让模型能在生成过程中调外部能力。` },
        { title: `${args.query} · 实践要点`, snippet: `典型 5 步：model 决定 → tool_call → execute → tool_result → model 继续生成。` },
        { title: `${args.query} · 常见坑`, snippet: `description 写糊模型不调；tool_result 失败要回灌不能抛；独立 IO 该并行。` },
      ],
    };
  },
};