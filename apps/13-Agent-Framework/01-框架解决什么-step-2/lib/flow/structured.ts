/**
 * 职责：调一次模型，按 (provider, protocol) 走同一条 SDK 拼装链（同 reasoning.ts），
 *   用 streamText({ output: Output.object({ schema }) }) 强约束输出 JSON。两种协议共用同一个 SDK 路径，
 *   浏览器侧只看最终解析后的对象。
 *
 * 数据流：query + providerId + protocol → getLlmForProvider → createModel(...)
 *   → streamText({ model, output: Output.object({ schema }), prompt, ...anthropicGenerateOpts })
 *   → result.output 拿解析后的强类型对象 → JSON 写到 ctx.res。
 *
 * 对照 lib/flow/reasoning.ts：那条用 streamText + 流式输出 UI 消息流；
 *   这条用 streamText + Output.object + 一次性 JSON。本文件是 step-2 "AI SDK 横向能力" 的 sub-page，
 *   演示"输出怎么约束"，跟 reasoning 那条"推理怎么拆"正交。
 *
 * 注意：generateObject 在 SDK 7.x 已标 deprecated（用 streamText + Output.object 替代）。
 *
 * schema 选择：纯事实题 { year: number, founder: string, related: string[] }。
 *   不要选需要思考的题（模型会先写思考再写 JSON，Output.object 拿不到完整 JSON）。
 */
import type { ServerResponse } from "node:http";
import { Output, streamText, zodSchema } from "ai";
import { z } from "zod";
import {
  type ProductionProviderId,
  getLlmForProvider,
} from "../../../../llm.js";
import { createModel, type Protocol } from "../cafe/model.js";
import { logger } from "../logger.js";

export const chickenSchema = z.object({
  year: z.number().int().describe("公开发布年份"),
  founder: z.string().describe("主要作者 / 设计者（公众认知最广的那个）"),
  related: z.array(z.string()).describe("同时期 1-3 个相关技术名词"),
});

export type ChickenAnswer = z.infer<typeof chickenSchema>;

export async function pipeStructured(
  query: string,
  providerId: ProductionProviderId,
  protocol: Protocol,
  response: ServerResponse,
  abortSignal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  const llm = getLlmForProvider(providerId);
  if (!llm) {
    throw new Error(`提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`);
  }
  logger.info("pipeStructured", "调用函数：pipeStructured", `provider=${providerId} · protocol=${protocol} · 一次 streamText + Output.object 强约束吐 JSON。`, {});
  logger.info("pipeStructured", "调用函数：pipeStructured", "记下这一次的 query + provider + protocol + 模型 id + baseURL。", {
    入参: { query, providerId, protocol, modelA: llm.modelA, baseUrlA: llm.baseUrlA, modelB: llm.modelB, baseUrlB: llm.baseUrlB, maxTokensB: llm.maxTokensB },
  });

  // structured 输出：minimax 那条必须 useReasoningMiddleware=false，否则中间件会拆 JSON
  const model = createModel(providerId, protocol, { useReasoningMiddleware: false });
  const anthropicGenerateOpts: Record<string, unknown> = protocol === "anthropic"
    ? {
        maxTokens: llm.maxTokensB + 1024,
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled" as const, budgetTokens: llm.maxTokensB },
          },
        },
      }
    : {};
  logger.info("pipeStructured", "调用函数：pipeStructured", "函数体：createModel → 拼 anthropicGenerateOpts → streamText({ output: Output.object }) → 拿 result.output → JSON 写 res。", {
    __code: pipeStructured.toString(),
  });

  const 入参 = {
    modelProvider: protocol === "openai"
      ? (providerId === "minimax" ? "openai(无中间件，直调 chat)" : "openai-compatible(createOpenAICompatible，SDK 内部拆 delta.reasoning_content)")
      : "anthropic(原生 thinking blocks)",
    modelId: protocol === "openai" ? llm.modelA : llm.modelB,
    baseURL: protocol === "openai" ? llm.baseUrlA : `${llm.baseUrlB}/v1/messages`,
    outputName: "chicken_rabbit_answer",
    outputDescription: "纯事实题强类型输出：年份 / 作者 / 同期相关技术",
    prompt: query,
    ...anthropicGenerateOpts,
  };
  logger.info("│ streamText", "调用模型：streamText + Output.object", `provider=${providerId} · protocol=${protocol} · 真发网络请求。Output.object 按 zodSchema 强制对齐输出 JSON；模型吐出来不合 schema 时 SDK 走自动 repair。`, {
    入参,
  });

  try {
    // 三重 prompt 引导：① 强制 JSON ② 写明 schema 字段名 + 类型 ③ 用 <output> 收窄区间
    const fullPrompt = [
      "你必须只输出一个合法 JSON 对象，禁止包含 <think> 标签、Markdown 代码块（```json ... ```）、自然语言解释、聊天寒暄。",
      "JSON 形状必须是：",
      "{ \"year\": number, \"founder\": string, \"related\": string[] }",
      "year 是 4 位整数；founder 是公众认知最广的作者名；related 是 1-3 个同时期相关技术。",
      "<output>" + query + "</output>",
    ].join("\n");
    // generateObject 在 SDK 7.x 已标 deprecated；改用 streamText({ output: Output.object(...) })。
    // 同一份 streamText 入口 + Output.object({ schema })，SDK 内部按 schema 强制对齐；
    // 模型吐不合 schema 时 SDK 走自动 repair；返回时 result.output 是解析后的强类型对象。
    const anthropicGenerateOpts: Record<string, unknown> = protocol === "anthropic"
      ? { providerOptions: { anthropic: { thinking: { type: "enabled" as const, budgetTokens: llm.maxTokensB } } } }
      : {};
    const result = streamText({
      model,
      output: Output.object({
        schema: zodSchema(chickenSchema),
        name: "chicken_rabbit_answer",
        description: "纯事实题强类型输出：年份 / 作者 / 同期相关技术",
      }),
      prompt: fullPrompt,
      abortSignal,
      ...anthropicGenerateOpts,
    });
    const object = await result.output;
    const finishReason = await result.finishReason;
    const usage = await result.usage;
    logger.info("│ streamText", "结束：streamText", `protocol=${protocol} · provider=${providerId}`, {
      耗时ms: Date.now() - started,
      返回值: { object, finishReason, usage },
    });
    const body = {
      ok: true as const,
      provider: providerId,
      protocol,
      modelId: protocol === "openai" ? llm.modelA : llm.modelB,
      object,
      elapsedMs: Date.now() - started,
    };
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(body));
    logger.info("pipeStructured", "结束：pipeStructured", `protocol=${protocol} · provider=${providerId} JSON 已写完。`, {
      耗时ms: Date.now() - started,
      返回值: { streamed: false, bytes: JSON.stringify(body).length },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("pipeStructured", "结束：pipeStructured（失败）", "streamText + Output.object 抛错；把原文回浏览器。", {
      返回值: { message, name: error instanceof Error ? error.name : typeof error },
    });
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: message }));
    } else {
      response.end();
    }
    throw error;
  }
}
