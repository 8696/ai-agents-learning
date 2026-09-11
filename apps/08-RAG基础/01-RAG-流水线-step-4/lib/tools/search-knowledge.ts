/**
 * 职责：search_knowledge 工具。Agent 循环里调它查内部手册。
 * 数据流：embedTexts(question, type=query) → searchChunks → 返回 Top-K 切块 + 分数 + 来源。
 */
import { getLlm } from "../../../../llm.js";
import { embedPrefixRule, embedTexts } from "../embed/create-embeddings.js";
import { HttpError } from "../http/send-error.js";
import { maskSecret, withCall } from "../log/with-call.js";
import { searchChunks, type HitRow } from "../store/vector-store.js";

const TOP_K = 3;

export type SearchKnowledgeResult = {
  question: string;
  embed: { model: string; prefixRule: string; dimensions: number };
  hits: Array<{
    id: string;
    score: number;
    source: string;
    section: string;
    text: string;
  }>;
  hitCount: number;
  maxScore: number;
};

export async function searchKnowledge(question: string): Promise<SearchKnowledgeResult> {
  const llm = getLlm();
  return withCall({
    scope: "│ 调用函数-searchKnowledge",
    kind: "函数",
    name: "searchKnowledge",
    explain: "agent 循环里的工具。问题向量化 → 余弦排序 → Top-K。复用 ask-pipeline 的检索路径。",
    args: { question, topK: TOP_K, embeddingModel: llm.embeddingModel, apiKey: maskSecret(llm.apiKey) },
    code: "embedTexts(question, type=query) → searchChunks → Top-K",
    run: async () => {
      if (!llm.embeddingModel) {
        throw new HttpError(
          400,
          "当前提供商没有嵌入模型",
          "填 LLM_EMBEDDING_MODEL 或换提供商",
        );
      }
      const queryVector = (await embedTexts(llm, [question], "query"))[0] ?? [];
      const hits = await searchChunks(queryVector, TOP_K);
      const maxScore = hits.length > 0 ? hits[0].score : 0;
      return {
        question,
        embed: {
          model: llm.embeddingModel,
          prefixRule: embedPrefixRule(llm.provider),
          dimensions: queryVector.length,
        },
        hits: hits.map((hit: HitRow) => ({
          id: hit.id,
          score: hit.score,
          source: hit.source,
          section: hit.section,
          text: hit.text,
        })),
        hitCount: hits.length,
        maxScore,
      };
    },
  });
}