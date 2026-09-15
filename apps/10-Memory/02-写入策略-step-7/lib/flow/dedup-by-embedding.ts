/**
 * 本步核心：第 4 关「去重」的第三步——变体 4-C 措辞不同但意思一样 → 嵌入相似度查重。
 *
 * 职责：拿一段新候选文本 → 调嵌入模型算向量 → 跟事实库里所有现有事实比余弦相似度
 *   → 最高相似度 ≥ threshold 判为语义重复。
 *
 * 数据流：text + threshold
 *   → kvList 拿库里所有事实
 *   → 一次 batch 嵌入（text + 所有 value 字符串）
 *   → 余弦相似度（纯本地算）
 *   → 最高 ≥ threshold → action = "semantic_dup"（带 bestMatch）
 *   → 否则 → action = "new"
 *
 * 复用模块 08：嵌入 + 余弦的几何意义一致——模块 08 用来排序，这里用来判断
 *   「是否同义」（same fact）。threshold 是产品参数。
 */
import { kvList, kvSet } from "../db.js";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

export interface DedupByEmbeddingResult {
  action: "new" | "semantic_dup";
  threshold: number;
  bestMatch?: { key: string; value: unknown; similarity: number };
  /** true = 已调 kvSet 把 bestMatch.key 的 value 替换为新候选 text；false = 只判没写 */
  merged?: boolean;
  mergedKey?: string;
}

/** 把 value（可能是对象 / 数组 / 字符串）都转成可嵌入的字符串 */
function toComparableText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** 余弦相似度；纯本地算 */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export async function dedupByEmbedding(
  text: string,
  threshold: number,
  mergeToBestMatch: boolean = false,
  userId: string = "default",
): Promise<DedupByEmbeddingResult> {
  // ① 阈值范围防御（不合法直接抛错，跟 step-2 置信度阈值同款）
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`threshold 必须是 [0, 1] 的有限数；收到 ${threshold}`);
  }

  logger.info(
    "调用函数-dedupByEmbedding",
    "调用函数开始：dedupByEmbedding",
    "为什么写这条日志：变体 4-C 是去重 4 种情况里第二难——拿一段文本算嵌入，跟库里所有事实比余弦，最相似的超过 threshold 判语义重复。当前：拿到 text + threshold，准备算嵌入。",
    {
      入参: { text, threshold, userId },
      __code: "const emb = await llm.openai.embeddings.create({ model: llm.embeddingModel, input: [text, ...factTexts] });",
    },
  );

  const t0 = Date.now();

  // ② 拿库里所有事实
  const facts = await kvList(userId);
  const factEntries = Object.entries(facts);
  const factTexts = factEntries.map(([, v]) => toComparableText(v));

  // ③ 嵌入 API 调用：MiniMax / 国内部分网关的 /v1/embeddings 参数路径是 `texts` + `type`（不是 OpenAI 的 `input`）；
  //   智谱 / 千问走 embeddings.create，但必须显式 encoding_format=float——OpenAI SDK 默认按 base64 解码，智谱返回小数数组会被解成全 0。
  //   （生产里要按 fact key 缓存 embedding，避免每次重算——本步先保证跑通。）
  //   参照 apps/08-RAG基础/01-RAG-流水线-step-4/lib/embed/create-embeddings.ts 的写法。
  const llm = getLlm();
  if (!llm.embeddingModel) {
    throw new Error(
      `当前提供商 ${llm.provider} 没有默认嵌入模型 id；在 apps/.env 顶层设 LLM_EMBEDDING_MODEL`,
    );
  }

  const embedUrl = `${llm.baseUrlA.replace(/\/$/, "")}/embeddings`;
  const isMiniMax = llm.provider === "minimax";
  const inputs = [text, ...factTexts];

  const vectors: number[][] = [];
  for (let i = 0; i < inputs.length; i++) {
    let resp: Response;
    if (isMiniMax) {
      // MiniMax：参数 texts + type=db（库里事实 + 新候选都按 db 入库类型算；同一模型、两边约定一致才能比）
      resp = await fetch(embedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.apiKey}` },
        body: JSON.stringify({ model: llm.embeddingModel, texts: [inputs[i]], type: "db" }),
      });
    } else {
      // OpenAI 兼容（智谱 / 千问 / custom）：参数 input + encoding_format=float
      resp = await fetch(embedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.apiKey}` },
        body: JSON.stringify({
          model: llm.embeddingModel,
          input: [inputs[i]],
          encoding_format: "float",
        }),
      });
    }

    if (!resp.ok) {
      const bodyText = await resp.text();
      throw new Error(
        `嵌入 API HTTP ${resp.status}：${bodyText.slice(0, 300)}（embedUrl = ${embedUrl}，provider = ${llm.provider}）`,
      );
    }
    const body = (await resp.json()) as {
      vectors?: number[][];
      data?: Array<{ embedding?: number[] }>;
      base_resp?: { status_code?: number; status_msg?: string };
    };
    // 失败检查：MiniMax 把 status_code 放在 base_resp 里
    if (body.base_resp && body.base_resp.status_code != null && body.base_resp.status_code !== 0) {
      throw new Error(
        `嵌入 API 失败：${body.base_resp.status_msg ?? "unknown"}（status_code=${body.base_resp.status_code}）`,
      );
    }
    let vec: number[] | undefined;
    if (Array.isArray(body.vectors) && Array.isArray(body.vectors[0])) {
      vec = body.vectors[0];
    } else if (Array.isArray(body.data) && Array.isArray(body.data[0]?.embedding)) {
      vec = body.data[0].embedding;
    }
    if (!vec) {
      throw new Error(
        `嵌入 API 返回结构异常：data 类型 = ${typeof body.data} / 响应 keys = ${Object.keys(body).join(",")} / 完整响应（截断 500）= ${JSON.stringify(body).slice(0, 500)}`,
      );
    }
    vectors.push(vec);
  }

  // ④ 余弦相似度（纯本地算）找最高
  const newVec = vectors[0];
  let bestIdx = -1;
  let bestSim = -1;
  for (let i = 0; i < factEntries.length; i++) {
    const sim = cosine(newVec, vectors[i + 1]);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }

  // ⑤ 判定
  let result: DedupByEmbeddingResult =
    bestIdx >= 0 && bestSim >= threshold
      ? {
          action: "semantic_dup",
          threshold,
          bestMatch: {
            key: factEntries[bestIdx][0],
            value: factEntries[bestIdx][1],
            similarity: bestSim,
          },
        }
      : { action: "new", threshold };

  // ⑥ 可选归并：判 semantic_dup + 调用方同意 → 调 kvSet 把 bestMatch.key 的 value 替换为新候选 text
  //    跨 key 语义重复归并到已存在的 key（不删旧 key / 不另存新 key）—— 这是笔记 §4 表 4-C「归并」的标准动作。
  //    仅判 + 不写时这步跳过，避免「同义就直接覆盖」伪知识。
  if (mergeToBestMatch && result.action === "semantic_dup" && result.bestMatch) {
    const mergeKey = result.bestMatch.key;
    logger.info(
      "│ 调用函数-dedupByEmbedding",
      "归并：调 kvSet 替换 bestMatch.key 的 value",
      "为什么写这条日志：调用方勾了 mergeToBestMatch + 判 semantic_dup 命中 → 调 kvSet 把 bestMatch.key 的 value 替换为新候选 text，库状态更新。当前：准备写。",
      {
        入参: { mergeKey, newText: text.slice(0, 200) },
        __code: "await kvSet(userId, mergeKey, { value: text, type: '语义记忆', confidence: 1.0, source: '4-C 跨 key 嵌入相似度归并', validUntil: null });",
      },
    );
    const mergeT0 = Date.now();
    await kvSet(userId, mergeKey, {
      value: text,
      type: "语义记忆",
      confidence: 1.0,
      source: "4-C 跨 key 嵌入相似度归并",
      validUntil: null,
    });
    result = { ...result, merged: true, mergedKey: mergeKey };
    logger.info(
      "│ 调用函数-dedupByEmbedding",
      "归并：kvSet 替换完成",
      "为什么写这条日志：要记下这次归并的目标 key + 耗时，方便排查「这条什么时候被归并进库里」。当前：归并完成。",
      { 返回值: { mergedKey: mergeKey }, 耗时ms: Date.now() - mergeT0 },
    );
  }

  logger.info(
    "调用函数-dedupByEmbedding",
    "调用函数结束：dedupByEmbedding",
    `为什么写这条日志：要让路由知道下一步该怎么走——semantic_dup → 提示用户「和库里 X 同义」/ new → 库里没有同义的，可以放心写。当前：判定完成，action = ${result.action}，最高相似度 = ${bestSim.toFixed(4)}。`,
    {
      返回值: {
        action: result.action,
        bestSimilarity: bestSim,
        bestMatchKey: result.bestMatch?.key ?? null,
      },
      耗时ms: Date.now() - t0,
      字段释义: {
        action: "semantic_dup = 措辞不同但意思一样（最高相似度 ≥ threshold）/ new = 库里没有同义的",
        bestSimilarity: "新候选跟库里最相似那条事实的余弦相似度（[-1, 1]）",
        bestMatchKey: "库里最相似那条事实的 key（仅在 semantic_dup 时返回）",
      },
    },
  );

  return result;
}
