/**
 * 职责：给 Vercel AI SDK 拼 MiniMax 的 Chat Completions 模型。这一步不带任何 tools。
 *
 * 数据流：getLlm → createOpenAI().chat(modelA) → 仅模型，无 tool 注册。
 */
import { createOpenAI } from "@ai-sdk/openai";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

export function createBasicSdkRuntime() {
  const llm = getLlm();
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  logger.info("createBasicSdkRuntime", "调用函数：createBasicSdkRuntime", "无 make_latte。基础聊天，没有工具循环。", {
    入参: { provider: llm.provider, model: llm.modelA },
  });
  return {
    llm,
    model: provider.chat(llm.modelA),
  };
}