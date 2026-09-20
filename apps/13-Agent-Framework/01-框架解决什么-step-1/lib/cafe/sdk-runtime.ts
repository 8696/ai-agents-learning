/**
 * 职责：给 Vercel AI SDK 拼 MiniMax 的 Chat Completions 模型和吧台工具 make_latte。
 *
 * 数据流：getLlm → createOpenAI().chat(modelA) + tool(make_latte) → generateText / streamText 共用。
 */
import { createOpenAI } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import {
  MAKE_LATTE_DESCRIPTION,
  MAKE_LATTE_NAME,
  executeMakeLatte,
} from "./cafe-shared.js";
import { logger } from "../logger.js";

export function createCafeSdkRuntime() {
  const llm = getLlm();
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  const makeLatteTool = tool({
    description: MAKE_LATTE_DESCRIPTION,
    inputSchema: z.object({
      cupSize: z.enum(["small", "medium", "large"]).describe("杯型"),
      drink: z.string().describe("饮品英文名，例如 latte"),
    }),
    execute: async (raw) => {
      logger.info("│ make_latte", "调用函数：executeMakeLatte", "库内部要出杯，仍执行你注册的本地函数。", {
        入参: raw,
        __code: executeMakeLatte.toString(),
      });
      const result = executeMakeLatte(raw);
      logger.info("│ make_latte", "结束：executeMakeLatte", "结果交回 SDK，由它塞回下一圈。", {
        耗时ms: 0,
        返回值: result,
      });
      return result;
    },
  });
  return {
    llm,
    model: provider.chat(llm.modelA),
    tools: { [MAKE_LATTE_NAME]: makeLatteTool },
  };
}
