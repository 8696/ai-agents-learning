/**
 * 职责：提问时不再拆库。本步核心是问题向量化 → 检索（Retrieve）→ 生成（Generate）。
 * 数据流：countChunks → embedTexts(问题, type=query) → searchChunks → chat.completions.create。
 */
import { getLlm } from "../../../../llm.js";
import { embedPrefixRule, embedTexts } from "../embed/create-embeddings.js";
import { HttpError } from "../http/send-error.js";
import { logger } from "../logger.js";
import { maskSecret, withCall } from "../log/with-call.js";
import { countChunks, searchChunks, type HitRow } from "../store/vector-store.js";

const TOP_K = 3;

/**
 * 弃权阈值：Top-1 分数低于这条线，就当作「库没有相关材料」。
 * 笔记取舍表说「分数线等 Demo 跑出来再定，禁止拍脑袋写死」。
 * 这里先用一个保守值（0.5），调整方法：同一条无关问题打几次，看 Top-1
 * 通常落在哪一带，把这条线挪到能区分「真命中 / 假命中」的位置。
 */
const ABSTAIN_MAX_SCORE = 0.5;

export type RetrievalQuality = {
  hitCount: number;
  maxScore: number;
  threshold: number;
  abstained: boolean;
  reason: "no-materials" | "ok";
};

export type AskResult = {
  question: string;
  embed: { model: string; prefixRule: string; dimensions: number };
  retrieval: RetrievalQuality;
  hits: Array<{
    id: string;
    score: number;
    source: string;
    section: string;
    text: string;
  }>;
  prompt: { system: string; user: string };
  answer: string;
  stepsRan: Array<"embed" | "retrieve" | "generate">;
  rebuiltIndex: false;
};

function buildPrompt(
  question: string,
  hits: HitRow[],
  retrieval: RetrievalQuality,
): { system: string; user: string } {
  const baseSystem =
    "你是售后助手。只根据下面材料回答。回答里点出来源文件和章节。材料不够就说不知道，不要编政策。";
  const system = retrieval.abstained
    ? baseSystem +
      "\n【本次检索结果】知识库里没有与用户问题相关的材料。" +
      "请直接回答「知识库里没有相关信息，我不能编」，不要尝试给政策、不要编订单号或菜单。"
    : baseSystem;
  const materials = hits
    .map(
      (hit, index) =>
        `【材料${index + 1}】${hit.source} / ${hit.section}（分数 ${hit.score.toFixed(3)}）\n${hit.text}`,
    )
    .join("\n\n");
  const user = retrieval.abstained
    ? `（无可用材料）\n\n【问题】${question}`
    : `${materials}\n\n【问题】${question}`;
  return { system, user };
}

export async function runAsk(question: string): Promise<AskResult> {
  const llm = getLlm();
  return withCall({
    scope: "调用函数-runAsk",
    kind: "函数",
    name: "runAsk",
    explain: "提问只跑后半段。不要重新加载、切块整份说明书。",
    args: { question, topK: TOP_K, embeddingModel: llm.embeddingModel, chatModel: llm.modelA, apiKey: maskSecret(llm.apiKey) },
    code: "embedTexts(问题, type=query) → searchChunks → chat.completions.create",
    run: async () => {
      if (!llm.embeddingModel) {
        throw new HttpError(
          400,
          "当前提供商没有嵌入模型（Embedding Model）",
          "填 LLM_EMBEDDING_MODEL，或换一家有嵌入接口的提供商",
        );
      }
      const rowCount = await countChunks();
      if (rowCount === 0) {
        throw new HttpError(409, "还没拆库", "先点「建库」，把 refund.md 拆成多行再提问");
      }
      const queryVector = (await embedTexts(llm, [question], "query"))[0] ?? [];
      const hits = await searchChunks(queryVector, TOP_K);
      const maxScore = hits.length > 0 ? hits[0].score : 0;
      const retrieval: RetrievalQuality = {
        hitCount: hits.length,
        maxScore,
        threshold: ABSTAIN_MAX_SCORE,
        abstained: hits.length === 0 || maxScore < ABSTAIN_MAX_SCORE,
        reason:
          hits.length === 0 || maxScore < ABSTAIN_MAX_SCORE ? "no-materials" : "ok",
      };
      logger.info(
        "调用函数-runAsk",
        "字段释义 · AskResult.retrieval",
        "本次检索质量摘要：命中数 / Top-1 最高分 / 阈值 / 是否触发弃权 / 原因。abstained=true 时模型被强制要求说不知道。",
        {
          入参: retrieval,
          __code: "abstained = (hitCount === 0) || (maxScore < threshold)",
        },
      );
      const prompt = buildPrompt(question, hits, retrieval);
      const chat = await withCall({
        scope: "││ 调用模型-对话补全",
        kind: "模型",
        name: "chat.completions.create",
        explain: "生成步：把带出处的材料塞进提示词（Prompt）。真发网络请求。",
        args: {
          model: llm.modelA,
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        },
        code: "llm.openai.chat.completions.create({ model, messages })",
        run: () =>
          llm.openai.chat.completions.create({
            model: llm.modelA,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
          }),
      });
      const answer = chat.choices[0]?.message?.content ?? "";
      return {
        question,
        embed: {
          model: llm.embeddingModel,
          prefixRule: embedPrefixRule(llm.provider),
          dimensions: queryVector.length,
        },
        retrieval,
        hits: hits.map((hit) => ({
          id: hit.id,
          score: hit.score,
          source: hit.source,
          section: hit.section,
          text: hit.text,
        })),
        prompt,
        answer,
        stepsRan: ["embed", "retrieve", "generate"],
        rebuiltIndex: false,
      };
    },
  });
}
