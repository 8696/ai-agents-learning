/**
 * 职责：按 (provider, protocol) 拼一个能喂 streamText 的 LanguageModel。
 *
 * 数据流：
 *   protocol=openai → 按 provider 选 SDK：
 *     · minimax：createOpenAI（@ai-sdk/openai）+ extractReasoningMiddleware({ tagName: "think" })
 *       —— minimax 把思考写在 content 里包 `` 文本
 *     · zhipu / deepseek / qwen：createOpenAICompatible（@ai-sdk/openai-compatible）
 *       —— 这三家把思考放在 delta.reasoning_content（OpenAI 网关扩展字段）；
 *         @ai-sdk/openai 不读它，@ai-sdk/openai-compatible 原生支持，
 *         SDK 内部直接把 delta.reasoning_content 合成 reasoning-start/delta/end。
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
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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

export interface CreateModelOptions {
  /**
   * 是否给 minimax 这条 OpenAI 路径包 extractReasoningMiddleware。
   *   - 默认 true（reasoning 页要拆 reasoning 段）
   *   - 结构化输出（generateObject）必须传 false——minimax 默认把 JSON 包在 `` 标签里，
   *     中间件会先拆 reasoning、再把剩下的 text 喂给 generateObject，但 generateObject 拿不到
   *     完整 JSON，会报 "response did not match schema"。
   */
  useReasoningMiddleware?: boolean;
}

export function createModel(
  providerId: ProductionProviderId,
  protocol: Protocol,
  options: CreateModelOptions = {},
): LanguageModel {
  const useReasoningMiddleware = options.useReasoningMiddleware !== false;
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
  // 按 provider 选 SDK：
  //   minimax → createOpenAI（用 /chat/completions）+ extractReasoningMiddleware
  //     （minimax 把思考写在 content 里包 `` 文本）
  //   zhipu / deepseek / qwen → createOpenAICompatible（用 /chat/completions，
  //     但 SDK 内部会读 delta.reasoning_content 拆出 reasoning 段）
  const useOpenAICompatible =
    providerId === "zhipu" || providerId === "deepseek" || providerId === "qwen";
  let wrapped: LanguageModel;
  if (useOpenAICompatible) {
    const provider = createOpenAICompatible({
      name: llm.provider,
      apiKey: llm.apiKey,
      baseURL: llm.baseUrlA,
    });
    const rawModel = provider(llm.modelA);
    logger.info("│ createModel.openai", "调用函数：createOpenAICompatible", `provider=${providerId} · model=${llm.modelA} · baseURL=${llm.baseUrlA}。`, {
      入参: { providerId, apiKeyLen: llm.apiKey.length, baseUrl: llm.baseUrlA, modelId: llm.modelA },
    });
    wrapped = rawModel;
  } else {
    const provider = createOpenAI({
      apiKey: llm.apiKey,
      baseURL: llm.baseUrlA,
      name: llm.provider,
    });
    const rawModel = provider.chat(llm.modelA);
    logger.info("│ createModel.openai", "调用函数：createOpenAI", `provider=${providerId} · model=${llm.modelA} · baseURL=${llm.baseUrlA} · useReasoningMiddleware=${useReasoningMiddleware}。`, {
      入参: { providerId, apiKeyLen: llm.apiKey.length, baseUrl: llm.baseUrlA, modelId: llm.modelA, useReasoningMiddleware },
    });
    if (useReasoningMiddleware) {
      wrapped = wrapLanguageModel({
        model: rawModel as unknown as Parameters<typeof wrapLanguageModel>[0]["model"],
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      });
    } else {
      wrapped = rawModel;
    }
  }
  logger.info("createModel", "结束：createModel", `protocol=openai · provider=${providerId} · ${useOpenAICompatible ? "createOpenAICompatible：SDK 内部把 delta.reasoning_content 合成 reasoning-start/delta/end" : (useReasoningMiddleware ? "createOpenAI + wrap + extractReasoningMiddleware(tagName=think)：拆 <think>…</think> 文本" : "createOpenAI 原生模型（未 wrap 中间件，结构化输出 / 单元测试用）")}。`, {
    返回值: { provider: providerId, protocol, modelId: llm.modelA, sdk: useOpenAICompatible ? "createOpenAICompatible" : (useReasoningMiddleware ? "createOpenAI+wrap+extractReasoningMiddleware" : "createOpenAI") },
  });
  return wrapped;
}
