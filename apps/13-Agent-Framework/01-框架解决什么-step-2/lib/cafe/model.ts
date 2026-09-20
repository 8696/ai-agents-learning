/**
 * 职责：按 (provider, protocol) 拼一个能喂 streamText 的 LanguageModel。
 *
 * 数据流：
 *   protocol=openai → createOpenAI(XXX_BASE_URL).chat(XXX_MODEL)
 *     → wrapLanguageModel + extractReasoningMiddleware({ tagName: "think" })
 *
 *   protocol=anthropic → createAnthropic(经过补 /v1 的 XXX_ANTHROPIC_BASE_URL).chat(XXX_ANTHROPIC_MODEL)
 *     · SDK 拼装策略（@ai-sdk/anthropic@2.0.102）：
 *       ① createAnthropic 默认 baseURL = "https://api.anthropic.com/v1"（已带 /v1）
 *       ② AnthropicMessagesLanguageModel.buildRequestUrl 的 fallback = `${baseURL}/messages`（**不带 /v1**）
 *       ③ 所以 SDK 拼的是 `${baseURL}/messages`，不会自己加 /v1。官方 API 因为 baseURL 默认就
 *          带 /v1，路径拼成 /v1/messages 一切正常。
 *     · 我们的 .env：
 *       XXX_ANTHROPIC_BASE_URL 一律是「Anthropic 兼容层前缀」（如 https://api.minimaxi.com/anthropic），
 *       不带 /v1。如果原样喂给 SDK，最终路径 = /anthropic/messages，少一段 /v1，网关 404。
 *     · 本文件做的事：
 *       给 baseURL 手动补 /v1（`${baseUrlB}/v1`），SDK 拼成 `${baseUrlB}/v1/messages`，网关能认。
 *     · 不包中间件——SDK 把原生 thinking content blocks 翻成 reasoning 段。
 *     · streamText 那侧要给 providerOptions.anthropic.thinking + maxTokens > budgetTokens
 *
 *   两协议拼装对照（学习者直接背）：
 *     ┌──────────┬──────────────────────────────┬──────────────────────────────────┐
 *     │ 协议     │ SDK 拼                       │ 喂 SDK 之前 baseURL 要有什么      │
 *     ├──────────┼──────────────────────────────┼──────────────────────────────────┤
 *     │ OpenAI   │ ${baseURL}/chat/completions  │ 已带 /v1（.env 写 .../v1）       │
 *     │ Anthropic│ ${baseURL}/messages（不带 /v1）│ **必须**手动补 /v1，SDK 不自己加│
 *     └──────────┴──────────────────────────────┴──────────────────────────────────┘
 *     → 口语版：
 *       OpenAI    .env 给 .../v1       SDK 拼 /chat/completions → /v1/chat/completions
 *       Anthropic .env 给 .../anthropic（本文件补 /v1） SDK 拼 /messages → /anthropic/v1/messages
 *     → 「/v1」这段**不能**指望 SDK 自动加，OpenAI 那边靠 .env 带，本文件这边手动补。
 *
 *   provider 选 minimax | zhipu | deepseek | qwen；任一家没 Key / 没模型 id → 抛错让 route 走 4xx。
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  extractReasoningMiddleware,
  wrapLanguageModel,
  type LanguageModel,
} from "ai";
import {
  type ProductionProviderId,
  getLlmForProvider,
} from "../../../../llm.js";
import { logger } from "../logger.js";

export type Protocol = "openai" | "anthropic";

export function createModel(providerId: ProductionProviderId, protocol: Protocol): LanguageModel {
  const llm = getLlmForProvider(providerId);
  if (!llm) {
    throw new Error(`提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`);
  }
  logger.info("createModel", "调用函数：createModel", `按 (provider, protocol) 选一条分支；两条都返回 LanguageModel 喂给 streamText。`, {
    入参: { providerId, protocol, modelA: llm.modelA, baseUrlA: llm.baseUrlA, modelB: llm.modelB, baseUrlB: llm.baseUrlB, maxTokensB: llm.maxTokensB },
  });
  logger.info("│ createModel", "调用函数：createModel", "函数体：openai 这条 createOpenAI + wrap + extractReasoningMiddleware；anthropic 这条 createAnthropic + 手动给 baseURL 补 /v1（SDK 不接 options.buildRequestUrl）。", {
    __code: createModel.toString(),
  });
  if (protocol === "anthropic") {
    // 手动给 baseURL 补 /v1。原因（详见顶部数据流注释）：
    //   SDK 拼的是 `${baseURL}/messages`（不带 /v1）。我们的 .env 给的 baseUrlB 一律
    //   是「Anthropic 兼容层前缀」（如 https://api.minimaxi.com/anthropic），不带 /v1。
    //   手动补 /v1 = `${baseUrlB}/v1`，SDK 拼成 `${baseUrlB}/v1/messages`，网关能认。
    //   官方 Anthropic API 不需要这一步，因为 SDK 默认 baseURL = https://api.anthropic.com/v1，
    //   已经带 /v1。
    const baseURLWithV1 = `${llm.baseUrlB}/v1`;
    const anthropicProvider = createAnthropic({
      apiKey: llm.apiKey,
      baseURL: baseURLWithV1,
    });
    const rawModel = anthropicProvider.chat(llm.modelB);
    logger.info("│ createModel.anthropic", "调用函数：createAnthropic", `provider=${providerId} · model=${llm.modelB} · 给 SDK 的 baseURL=${baseURLWithV1}（手动补 /v1），SDK 拼成 ${baseURLWithV1}/messages。`, {
      入参: { providerId, apiKeyLen: llm.apiKey.length, baseUrl: baseURLWithV1, modelId: llm.modelB },
    });
    logger.info("createModel", "结束：createModel", `protocol=anthropic · provider=${providerId} · 返回原生 LanguageModelV4，SDK 自己把 thinking 块翻成 reasoning 段。`, {
      返回值: { provider: providerId, protocol, modelId: llm.modelB, baseUrl: `${llm.baseUrlB}/v1/messages` },
    });
    return rawModel;
  }
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  const rawModel = provider.chat(llm.modelA);
  logger.info("│ createModel.openai", "调用函数：createOpenAI", `provider=${providerId} · model=${llm.modelA} · baseURL=${llm.baseUrlA}。`, {
    入参: { providerId, apiKeyLen: llm.apiKey.length, baseUrl: llm.baseUrlA, modelId: llm.modelA },
  });
  const wrapped = wrapLanguageModel({
    model: rawModel as unknown as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: extractReasoningMiddleware({ tagName: "think" }),
  });
  logger.info("createModel", "结束：createModel", `protocol=openai · provider=${providerId} · wrap extractReasoningMiddleware(tagName=think) 把 <think>…</think> 切成独立 reasoning 段。`, {
    返回值: { provider: providerId, protocol, modelId: llm.modelA, middleware: "extractReasoningMiddleware(tagName=think)" },
  });
  return wrapped;
}
