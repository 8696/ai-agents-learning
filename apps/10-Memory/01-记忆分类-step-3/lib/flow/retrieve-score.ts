/**
 * 本步核心：检索 / 按相关性召回（核心计算）—— 嵌入向量 + 余弦相似度 + pickTopK。
 *
 * 职责（按调用顺序）：
 *   1. embedBatch：把一组句子（问句 / 候选事实）调嵌入接口变成向量数组
 *      - minimax 用自家协议（POST /v1/embeddings，body = { model, texts, type }, type 取 "db"/"query"）
 *        → fetch 直发（OpenAI SDK 不认 `texts` / `type` 字段）
 *      - zhipu / qwen / custom 走 OpenAI 兼容协议，llm.openai.embeddings.create
 *   2. cosine：两个等长向量算余弦相似度 = A·B / (|A|·|B|)
 *   3. scoreOne：对单条事实算相似度，返回 score + 事实原句
 *   4. pickTopK：从全部 scored 里按分数倒序、取 Top-K
 *
 * 为什么单独成文件：纯计算（嵌入 + 余弦），不依赖 LLM 对话补全，方便上层（retrieve-and-compose 主流程 / 单元测试）按职责复用。
 * 不调网络（除嵌入外）、不读 facts.json；facts.json 读取在 lib/storage/facts-store，主流程在 lib/flow/retrieve-and-compose。
 */
import { getLlm } from "../../../../llm.js";
import type { PersistedFact } from "../storage/facts-store.js";

/** Top-K 候选项；含原 fact + 算出来的分数，方便上层展示 */
export interface ScoredFact {
  fact: PersistedFact;
  score: number;
  /** 事实原句，便于核对「这一条为什么被筛上来」 */
  factSentence: string;
}

/** 嵌入维度（每家可能不一样；调一次后拿到）—— 缓存一次后整轮复用 */
let dimCache: number | null = null;

/**
 * minimax 的嵌入接口不是 OpenAI 兼容：请求体字段是 { model, texts, type }（type = "db" | "query"），
 * 响应是 { vectors: number[][] }（"vectors" 是数组，每个元素是一条文本的嵌入向量）。
 * 走 fetch 直发，不绕 OpenAI SDK（SDK 不认 texts / type）。
 */
async function minimaxEmbed(inputs: string[], model: string, apiKey: string, baseUrl: string): Promise<number[][]> {
  const url = `${baseUrl.replace(/\/$/, "")}/embeddings`;
  const body = JSON.stringify({
    model,
    texts: inputs,
    type: "db",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`minimax 嵌入接口 HTTP ${res.status}：${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as { vectors?: number[][]; base_resp?: { status_code?: number; status_msg?: string } };
  // minimax 错误返回：vectors=null + base_resp.status_code / status_msg
  if (data.base_resp && data.base_resp.status_code !== 0 && data.base_resp.status_code !== undefined) {
    throw new Error(
      `minimax 嵌入接口错误（status_code=${data.base_resp.status_code}）：${data.base_resp.status_msg ?? "未知"}。` +
        (data.base_resp.status_code === 1008
          ? "——账户余额不足。请换一家支持嵌入的提供商（在 apps/.env 顶层改 LLM_PROVIDER，如 zhipu 或 qwen）。"
          : "——可在 apps/.env 顶层改 LLM_PROVIDER 切到 zhipu / qwen 等支持嵌入的服务商。"),
    );
  }
  if (!data.vectors) {
    throw new Error(
      `minimax 嵌入接口返回里没有 vectors 字段：${JSON.stringify(data).slice(0, 500)}（base_resp: ${JSON.stringify(data.base_resp ?? {})})`,
    );
  }
  return data.vectors;
}

/** 把一组句子一次性调嵌入接口，返回等长向量数组。空数组直接返回 []。 */
export async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const llm = getLlm();
  if (!llm.embeddingModel) {
    throw new Error(
      "当前模型服务商没有默认嵌入模型（embeddingModel 为空）。请在 apps/.env 顶层设 LLM_EMBEDDING_MODEL，或者换一家支持嵌入的提供商（minimax / zhipu / qwen）。",
    );
  }

  if (llm.provider === "minimax") {
    const vectors = await minimaxEmbed(inputs, llm.embeddingModel, llm.apiKey, llm.baseUrlA);
    if (dimCache === null && vectors.length > 0) dimCache = vectors[0].length;
    return vectors;
  }

  // zhipu / qwen / custom 走 OpenAI 兼容协议
  const response = await llm.openai.embeddings.create({
    model: llm.embeddingModel,
    input: inputs,
  });
  const vectors = response.data.map((d) => d.embedding as unknown as number[]);
  if (dimCache === null && vectors.length > 0) dimCache = vectors[0].length;
  return vectors;
}

/** 单条嵌入（给主流程问句用） */
export async function embedOne(text: string): Promise<number[]> {
  const [v] = await embedBatch([text]);
  if (!v) throw new Error(`嵌入接口返回了空向量：input=${text}`);
  return v;
}

/** 余弦相似度 = A·B / (|A|·|B|)。任一向量为空 / 长度不等 → 返回 0。 */
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** 算一条候选事实跟问句向量的相似度；返回 score + 事实原句。 */
export function scoreOne(queryVector: number[], fact: PersistedFact, factVector: number[]): ScoredFact {
  const score = cosine(queryVector, factVector);
  return { fact, score, factSentence: fact.sentence };
}

/** 把候选池按分数倒序排，返回 Top-K。K 大于候选数时按候选数返回。 */
export function pickTopK(scored: ScoredFact[], k: number): ScoredFact[] {
  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // 同分按 recordedAt 倒序（新写的优先）
    return b.fact.recordedAt.localeCompare(a.fact.recordedAt);
  });
  return sorted.slice(0, k);
}

/** 默认召回阈值（余弦相似度）：Top-1 分数低于此值 → 整组 Top-K 视为空。
 *
 * 为什么是 0.10：
 *   minimax 嵌入 1536 维实测——
 *     - 语义命中（前端框架 / 住哪个城市 / vue）：0.29 ~ 0.98
 *     - 弱匹配（事实库里没有：数据库 / 累 / 名字）：-0.04 ~ 0.28
 *   0.10 这条线能把「真有的」和「硬凑的」分开；
 *   不同模型 / 维度的阈值需要各自标定（详见模块 08 · 03「跨模型重标定」）。
 */
export const DEFAULT_SCORE_THRESHOLD = 0.10;

/** 应用阈值：Top-1 < 阈值 → 返回空数组；否则原样返回 topK。
 *  上层看到空数组就知道「这条问句在事实库里没找到相关事实」。 */
export function applyThreshold(
  topK: ScoredFact[],
  threshold: number = DEFAULT_SCORE_THRESHOLD,
): { filtered: ScoredFact[]; rejected: boolean; topScore: number; threshold: number } {
  if (topK.length === 0) return { filtered: [], rejected: false, topScore: 0, threshold };
  const topScore = topK[0].score;
  if (topScore < threshold) {
    return { filtered: [], rejected: true, topScore, threshold };
  }
  return { filtered: topK, rejected: false, topScore, threshold };
}

/** 给上层调试 / 页面显示用：当前嵌入维度（调过嵌入后才非空） */
export function currentDim(): number | null {
  return dimCache;
}

/** 阈值弃权信息：Top-1 score < 阈值 → 整组 Top-K 视为空时，附上原始 Top-1 让页面看到「这条问句最相近那条也只有 X 分」 */
export interface ThresholdRejection {
  rejected: true;
  topScore: number;
  threshold: number;
  /** 阈值之下被舍弃的那条 Top-1（让页面看到「即使最相近的也只有 X 分」） */
  rejectedTop: ScoredFact;
}

/** 一次嵌入 + 余弦 + Top-K + 阈值弃权 的共享一段。
 *  上层 retrieveOnly / askWithRetrieval 都要走这一段；放这里避免在两个文件里重复调嵌入接口和余弦。 */
export async function runRetrieval(
  query: string,
  topK: number,
  threshold: number,
  disableMemoryTypes: ReadonlySet<string> = new Set(),
): Promise<{
  pool: { facts: import("../storage/facts-store.js").PersistedFact[]; filePath: string };
  /** 因 toggle 被排除的原始条目；让学习者看到「开关关掉时哪些本来会被召回」 */
  excludedPool: { facts: import("../storage/facts-store.js").PersistedFact[] };
  rawTop: ScoredFact[];
  finalTop: ScoredFact[];
  topScore: number;
  thresholdRejection: ThresholdRejection | null;
}> {
  const { listFacts } = await import("../storage/facts-store.js");
  const rawPool = listFacts();
  // 按 disableMemoryTypes 过滤：被关掉的那一类走 excludedPool（页面能看见「如果开关全开本来能命中这些」），不走余弦
  const filtered = rawPool.facts.filter((f) => !disableMemoryTypes.has(f.memoryType));
  const excluded = rawPool.facts.filter((f) => disableMemoryTypes.has(f.memoryType));
  const pool = { facts: filtered, filePath: rawPool.filePath };
  const excludedPool = { facts: excluded };
  const allInputs = [query, ...pool.facts.map((f) => f.sentence)];
  const vectors = await embedBatch(allInputs);
  const queryVec = vectors[0];
  const factVecs = vectors.slice(1);
  const scored = pool.facts.map((f, i) => scoreOne(queryVec, f, factVecs[i]));
  const rawTop = pickTopK(scored, topK);
  const th = applyThreshold(rawTop, threshold);
  const finalTop = th.filtered;
  const topScore = rawTop[0]?.score ?? 0;
  let thresholdRejection: ThresholdRejection | null = null;
  if (th.rejected && rawTop.length > 0) {
    thresholdRejection = {
      rejected: true,
      topScore: th.topScore,
      threshold: th.threshold,
      rejectedTop: rawTop[0],
    };
  }
  return { pool, excludedPool, rawTop, finalTop, topScore, thresholdRejection };
}