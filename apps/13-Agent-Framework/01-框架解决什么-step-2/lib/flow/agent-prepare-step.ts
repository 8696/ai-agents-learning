/**
 * 本步核心：streamText({ tools, prepareStep }) 演示 Vercel AI SDK 控制「**每一步**用什么
 *   model / tools / messages」的能力。`stopWhen` 只控步数；`prepareStep` 控每步的运行时配置。
 *
 * 职责：复用 agent-loop.ts 的 readMenu / makeLatte 两个 mock 工具；streamText 挂 prepareStep
 *   按 stepNumber 渐进放工具；推 UI 消息流给浏览器拆帧。
 *
 *   step 0（第一步）只给 readMenu → 模型必须先查菜单
 *   step 1+ 解锁 makeLatte → 模型做出拿铁
 *
 * 数据流：
 *   query + providerId + protocol → getLlmForProvider → createModel
 *     → streamText({ model, prompt, tools, stopWhen: stepCountIs(3), prepareStep })
 *     → toUIMessageStream → pipeUIMessageStreamToResponse → Node 的 ServerResponse。
 *
 * 对照 lib/flow/agent-loop.ts：
 *   - agent-loop：stopWhen 只控步数；tools 全程 + 走 set
 *   - 本文件：prepareStep 让 step 0（第一步）只给只读工具，step 1（第二步）才给写工具
 *     ——「工具渐进」模式，让模型 step 1 必读菜单（没别的工具可选）
 *
 * useReasoningMiddleware: true（同 agent-loop；minimax 这条 OpenAI 路径要拆 reasoning）
 */
import type { ServerResponse } from "node:http";
import {
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from "ai";
import {
  type ProductionProviderId,
  getLlmForProvider,
} from "../../../../llm.js";
import { createModel, type Protocol } from "../cafe/model.js";
import { logger } from "../logger.js";
import { makeLatte, readMenu } from "./agent-loop.js";

// ── 入口 ────────────────────────────────────────────────────────────────
export async function pipeAgentPrepareStep(
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
  logger.info(
    "pipeAgentPrepareStep",
    "调用函数：pipeAgentPrepareStep",
    `provider=${providerId} · protocol=${protocol} · 一次 streamText；prepareStep 按 stepNumber 渐进放工具。`,
    {},
  );
  logger.info("pipeAgentPrepareStep", "调用函数：pipeAgentPrepareStep", "记下这一次的 query + provider + protocol + 模型 id + baseURL。", {
    入参: { query, providerId, protocol, modelA: llm.modelA, baseUrlA: llm.baseUrlA, modelB: llm.modelB, baseUrlB: llm.baseUrlB, maxTokensB: llm.maxTokensB },
  });

  const model = createModel(providerId, protocol, { useReasoningMiddleware: true });
  logger.info("pipeAgentPrepareStep", "调用函数：pipeAgentPrepareStep", "函数体：createModel → 拼 prepareStep → streamText({ tools, stopWhen: stepCountIs(3), prepareStep }) → 推 UI 消息流。", {
    __code: pipeAgentPrepareStep.toString(),
  });

  // prepareStep 按 stepNumber 渐进放工具：step 0 只给 readMenu，step 1+ 才给 makeLatte
  const prepareStep = async ({ stepNumber }: { stepNumber: number; model: unknown; steps: unknown }) => {
    if (stepNumber === 0) {
      // 第 1 步：只能查菜单（强制模型做 readMenu 才能继续）
      return { tools: { readMenu } };
    }
    // 第 2 步起：读菜单 + 做咖啡
    return { tools: { readMenu, makeLatte } };
  };

  const anthropicThinking: Record<string, unknown> = protocol === "anthropic"
    ? {
        maxTokens: llm.maxTokensB + 1024,
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled" as const, budgetTokens: llm.maxTokensB },
          },
        },
      }
    : {};
  const 入参 = {
    modelProvider: protocol === "openai"
      ? (providerId === "minimax" ? "openai(无中间件)" : "openai-compatible(createOpenAICompatible)")
      : "anthropic(原生 thinking blocks)",
    modelId: protocol === "openai" ? llm.modelA : llm.modelB,
    baseURL: protocol === "openai" ? llm.baseUrlA : `${llm.baseUrlB}/v1/messages`,
    prompt: query,
    tools: { readMenu: "（全程注册）", makeLatte: "（全程注册；step 0 不暴露）" },
    stopWhen: "stepCountIs(3)",
    prepareStep: "step 0 → { readMenu }；step 1+ → { readMenu, makeLatte }",
    ...anthropicThinking,
  };
  logger.info(
    "│ streamText",
    "调用模型：streamText + tools + stopWhen + prepareStep",
    `provider=${providerId} · protocol=${protocol} · 真发网络请求；prepareStep 控制每步可用工具集。`,
    { 入参 },
  );

  try {
    // streamText 多个 overload 在内联 prepareStep 时 TS 推断容易落到错误的 overload；
    // 这里整个 init 对象 cast 到最宽的 streamText 参数类型，避免窄 overload 拒收 prepareStep 函数。
    const streamInit = {
      model,
      prompt: query,
      tools: { readMenu, makeLatte },
      stopWhen: stepCountIs(3),
      prepareStep,
      abortSignal,
      ...anthropicThinking,
      onError: ({ error }: { error: unknown }) => {
        logger.error("│ streamText", "结束：streamText（失败）", "把 AI SDK 内部异常原文落日志。", {
          返回值: { name: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error) },
        });
      },
      onFinish: ({ steps, text, finishReason, usage }: { steps: unknown[]; text: string; finishReason: unknown; usage: unknown }) => {
        logger.info("│ streamText", "结束：streamText", `protocol=${protocol} · provider=${providerId}`, {
          耗时ms: Date.now() - started,
          返回值: { stepCount: steps.length, text, finishReason, usage },
        });
      },
    } as Parameters<typeof streamText>[0];
    const result = streamText(streamInit);

    await pipeUIMessageStreamToResponse({
      response,
      stream: toUIMessageStream({ stream: result.stream }),
    });
    logger.info("pipeAgentPrepareStep", "结束：pipeAgentPrepareStep", `protocol=${protocol} · provider=${providerId} 流已写入。`, {
      耗时ms: Date.now() - started,
      返回值: { streamed: true },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("pipeAgentPrepareStep", "结束：pipeAgentPrepareStep（失败）", "streamText 抛错；把原文回浏览器。", {
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