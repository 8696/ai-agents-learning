/**
 * 职责：Listwise（专用接口形状版）。请求 / 响应形状对得上业界 Cohere Rerank / Jina Reranker。
 * 本步核心：① 走专用接口的请求形状；② mock 实现按 text 命中政策热词 + 是否含「未拆 / 超期」约束粗略打分。
 * 数据流：问句 + documents[]（[{id, title, text}, ...]）→ mock 计算每条 score → 按 score 降序排 → { results: [{id, score}] }。
 * 为什么单独成文件：这一跳专门演示「专用接口的请求 / 响应形状」与「对话模型 Listwise」的差异。
 * 为什么是 mock：本仓库不接真 Cohere / Jina 密钥；教学点是形状一致，不是真调。
 */
import { logger } from "../logger.js";

export type Document = {
  id: string;
  title: string;
  text: string;
};

export type ShapeScore = {
  id: string;
  score: number;
};

export type ShapeResult = {
  query: string;
  results: ShapeScore[];
  orderedIds: string[];
  requestShape: { query: string; documents: { id: string; title: string }[] };
  responseShape: { results: { id: string; score: number }[] };
};

/**
 * 极简打分：政策热词命中 + 约束词加权；只是粗略 demo，不引真模型。
 * 用对话模型实现就是「listwise-llm」模式；这一跳证明「专用接口形状」也能给出新顺序。
 */
function scoreOne(query: string, doc: Document): number {
  const q = query.replace(/\s/g, "");
  let score = 0;
  // 政策热词：通用七天政策优先（模拟「业界接口会按语义近」）
  if (q.includes("7 天") || q.includes("七天") || q.includes("7天") || /七|7/.test(q)) {
    if (doc.text.includes("七天") || doc.text.includes("7天")) score += 0.4;
  }
  if (q.includes("退") || q.includes("退款")) {
    if (doc.text.includes("退货") || doc.text.includes("退回") || doc.text.includes("退款")) score += 0.3;
  }
  // 约束词加权：问句里的「没拆 / 超期 / 特例」对「未拆封超期」加权
  const constraints = ["没拆", "未拆封", "超期", "特例", "超过"];
  for (const c of constraints) {
    if (q.includes(c)) {
      if (doc.text.includes(c) || doc.text.includes("未拆") || doc.text.includes("超期") || doc.text.includes("特例")) {
        score += 0.4;
      }
    }
  }
  // 短文档略高
  score += 0.1 * Math.max(0, 1 - doc.text.length / 200);
  return Math.min(score, 1);
}

export function rerankViaShape(query: string, documents: Document[]): ShapeResult {
  const t0 = Date.now();

  logger.info(
    "调用函数-rerankViaShape",
    "调用函数开始：rerankViaShape",
    "为什么写这条日志：演示专用接口形状的请求 / 响应。本仓库不接真 Cohere，这里走 mock 打分，但请求 / 响应形状与业界协议一致。当前：即将打分。",
    {
      入参: { query, documentCount: documents.length },
      __code: "const scored = documents.map(d => scoreOne(query, d)); 按 score 降序排 orderedIds",
    },
  );

  const scored: ShapeScore[] = documents.map((doc) => ({
    id: doc.id,
    score: Number(scoreOne(query, doc).toFixed(3)),
  }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const orderedIds = scored.map((item) => item.id);

  const result: ShapeResult = {
    query,
    results: scored,
    orderedIds,
    // 响应形状：只回 documents 的 id + title，不回正文（与 Cohere Rerank / Jina Reranker 业界一致）
    requestShape: {
      query,
      documents: documents.map((d) => ({ id: d.id, title: d.title })),
    },
    responseShape: {
      results: scored,
    },
  };

  logger.info(
    "调用函数-rerankViaShape",
    "调用函数结束：rerankViaShape",
    "为什么写这条日志：专用接口已按形状返回。新顺序 = orderedIds，生成阶段按这个顺序取前 K。当前：mock 给分完毕。",
    { 返回值: { orderedIds, topScore: scored[0]?.score }, 耗时ms: Date.now() - t0 },
  );
  return result;
}