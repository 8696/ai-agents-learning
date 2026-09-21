/**
 * 职责：调两次嵌入模型，把一个「查询」和一组「文档」一起嵌入，再按余弦相似度（Cosine Similarity）排序取 Top-K。
 *   本文件用 AI SDK 的 ai.embed + ai.embedMany，并复用 lib/flow/embed.ts + lib/flow/embed-many.ts 的协议分支。
 *
 * 数据流：
 *   入参 = { query, documents[], topK, providerId }
 *   ↓
 *   Promise.all([
 *     runEmbed({ providerId, text: query }),                    // 单条：用户提问
 *     runEmbedMany({ providerId, texts: documents })             // 批量：候选文档库
 *   ])
 *   ↓
 *   对 queryEmbedding 和每条 documentEmbedding 算余弦相似度 = 点积 / (|A|·|B|)
 *   ↓
 *   排序取前 K 名 + 写回完整结果（让学习者看见「Top-K 之外」那段被筛掉的证据）
 *
 * 对照 lib/flow/embed.ts + lib/flow/embed-many.ts：把它们组合起来用，外加余弦排序。
 *   余弦相似度模块 08 RAG 第 3 条已写（详见 docs/学习模块/08-RAG基础/03-余弦相似度.md）；
 *   本文件不在那一条范围内重新推公式，只把现成计算包进来当作检索阶段的最小可用形式。
 *
 * 余弦公式：
 *   余弦 = 点积 / (A 的长度 × B 的长度)
 *   - 点积（Dot Product）：对应位相乘再相加
 *   - 长度 / 模（Magnitude / Norm）：这条向量的 L2 范数
 *   - 取值范围 -1 ~ 1；同向 ≈ 1，正交 ≈ 0，反向 ≈ -1
 *
 * 入参来源：
 *   query 与 documents 都由前端 textarea 传过来（一行 = 一条 document），后端不写死默认值；
 *   想要换对照场景直接改前端输入框。本文件只负责「并发嵌入 + 余弦排序 + 写回 Top-K」这一段。
 */
import type { ServerResponse } from "node:http";
import { type ProductionProviderId, getLlmForProvider } from "../../../../llm.js";
import { runEmbed } from "./embed.js";
import { runEmbedMany } from "./embed-many.js";
import { logger } from "../logger.js";

export interface CosineRecallItem {
  index: number;
  document: string;
  score: number;
}

export interface CosineRecallArgs {
  providerId: ProductionProviderId;
  query: string;
  documents: string[];
  topK: number;
  response: ServerResponse;
  abortSignal?: AbortSignal;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

interface MockResponse {
  headersSent: boolean;
  statusCode: number;
  body: Record<string, unknown>;
  setHeader: (k: string, v: string) => void;
  end: (chunk?: unknown) => void;
}

/**
 * 把 runEmbed / runEmbedMany 的结果装到「假响应」里——它们内部直接写 res，我们
 * 构造一个 writable 替身收集 JSON，之后统一排序 + 写到真实 res。这样既复用
 * lib/flow/embed.ts + embed-many.ts 的协议分支，又不在 route 层重复 fetch 代码。
 */
export async function runCosineRecall(args: CosineRecallArgs): Promise<void> {
  const { providerId, query, documents, topK, response } = args;
  const started = Date.now();

  logger.info("runCosineRecall", "调用函数：runCosineRecall", "入口：query + documents[] + topK → 复用 runEmbed + runEmbedMany（各自走 AI SDK → customProvider.doEmbed）→ 余弦相似度排序取 Top-K。", {
    字段释义: {
      providerId: "4 家生产环境 provider id",
      query: "用户提问（待嵌入的单条）",
      documents: "候选文档库（待嵌入的批量）—— 模块 08 RAG 的「检索源」",
      topK: "返回前 K 条（按余弦相似度降序）",
    },
    入参: { providerId, queryLen: query.length, documentsLen: documents.length, topK },
  });

  const llm = getLlmForProvider(providerId);
  if (!llm) {
    const msg = `提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`;
    logger.error("runCosineRecall", "结束：runCosineRecall（失败）", msg, { 返回值: { message: msg } });
    if (!response.headersSent) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }
  if (!llm.embeddingModel) {
    const msg = `提供商 ${providerId} 没在 apps/.env 配 embedding 模型 id。`;
    logger.error("runCosineRecall", "结束：runCosineRecall（失败）", msg, { 返回值: { message: msg } });
    if (!response.headersSent) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  logger.info("│ ai.embed + ai.embedMany", "调用模型：并发两条 SDK 调用", `provider=${providerId} · query 走 ai.embed；documents 走 ai.embedMany。两条都最终落到 customProvider.doEmbed。`, {
    入参: { providerId, query, documents },
  });

  // 串行两次采集 mock res（不能用 Promise.all 同 mock，被覆盖）
  const qMock: MockResponse = {
    headersSent: false, statusCode: 0, body: {},
    setHeader: function () {}, end: function (chunk?: unknown) { this.headersSent = true; const text = typeof chunk === "string" ? chunk : ""; try { this.body = JSON.parse(text); } catch (_) { this.body = {}; } },
  };
  const dMock: MockResponse = {
    headersSent: false, statusCode: 0, body: {},
    setHeader: function () {}, end: function (chunk?: unknown) { this.headersSent = true; const text = typeof chunk === "string" ? chunk : ""; try { this.body = JSON.parse(text); } catch (_) { this.body = {}; } },
  };

  try {
    await runEmbed({ providerId, text: query, response: qMock as unknown as ServerResponse });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("│ ai.embed", "结束：runEmbed（失败）", "cosine-recall 里 runEmbed 抛错；把原文回浏览器。", { 返回值: { message } });
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: "embed(query) 失败：" + message }));
    }
    return;
  }
  try {
    await runEmbedMany({ providerId, texts: documents, response: dMock as unknown as ServerResponse });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("│ ai.embedMany", "结束：runEmbedMany（失败）", "cosine-recall 里 runEmbedMany 抛错；把原文回浏览器。", { 返回值: { message } });
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: "embedMany(documents) 失败：" + message }));
    }
    return;
  }

  const queryEmbedding = qMock.body.embedding as number[] | undefined;
  const documentEmbeddings = dMock.body.embeddings as number[][] | undefined;
  if (!queryEmbedding) {
    const msg = "embed(query) 未返回 embedding 数组";
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }
  if (!documentEmbeddings) {
    const msg = "embedMany(documents) 未返回 embeddings 数组";
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  const scored: CosineRecallItem[] = documentEmbeddings.map(function (vec, idx) {
    return {
      index: idx,
      document: documents[idx],
      score: cosineSimilarity(queryEmbedding, vec),
    };
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  const k = Math.max(1, Math.min(topK, scored.length));
  const top = scored.slice(0, k);
  const rest = scored.slice(k);

  const elapsedMs = Date.now() - started;
  logger.info("│ ai.embed + ai.embedMany", "结束：并发两条 SDK 调用", `query 向量维度 ${queryEmbedding.length}；documents 共 ${documentEmbeddings.length} 条；已按余弦排序。`, {
    耗时ms: elapsedMs,
    字段释义: {
      queryEmbedding: "提问那条向量；和每条 documentEmbedding 同维度",
      documentEmbeddings: "候选文档库的批量向量；每条与 queryEmbedding 同维度",
      score: "余弦相似度 ∈ [-1, 1]；1 = 同向 / -1 = 反向 / 0 = 正交",
      top: "按 score 降序取前 K 条——RAG 检索阶段真正的产出",
    },
    返回值: { dim: queryEmbedding.length, totalScored: scored.length, topCount: top.length, restCount: rest.length },
  });
  logger.info("runCosineRecall", "结束：runCosineRecall", `Top-${k} 已写回。`, {
    耗时ms: elapsedMs,
    返回值: { topCount: top.length, topScores: top.map(function (x) { return x.score; }) },
  });

  if (!response.headersSent) {
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      ok: true,
      provider: providerId,
      embeddingModel: llm.embeddingModel,
      dim: queryEmbedding.length,
      query: query,
      top: top,
      rest: rest,
      elapsedMs: elapsedMs,
    }));
  }
}