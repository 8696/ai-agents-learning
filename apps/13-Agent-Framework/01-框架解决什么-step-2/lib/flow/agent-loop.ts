/**
 * 本步核心：streamText({ tools, stopWhen }) 把工具循环样板收走 + 演示 AI SDK 默认 stopWhen 是
 *   stepCountIs(1) 的踩坑点。同一个 query 在两种 mode 下跑：
 *     mode = "default"  → 不传 stopWhen，AI SDK 默认 stepCountIs(1)，模型调一次 readMenu 就停，拿铁没做
 *     mode = "stopWhen3" → 显式 stopWhen: stepCountIs(3)，模型读菜单 → makeLatte → 出正文"热拿铁好了"
 *
 * 职责：注册两个 mock 工具（readMenu / makeLatte）→ streamText 一次跑完 → 推 UI 消息流给浏览器拆帧；
 *   工具调用轨迹通过 UI 消息流的 tool-input-available / tool-output-available 事件流回浏览器。
 *
 * 数据流：
 *   query + providerId + protocol + mode → getLlmForProvider → createModel
 *     → streamText({ model, prompt, tools: { readMenu, makeLatte }, stopWhen })
 *     → toUIMessageStream → pipeUIMessageStreamToResponse → Node 的 ServerResponse。
 *
 * 对照 lib/flow/{basic-chat,reasoning,structured}.ts：
 *   - basic-chat：无 tools、无 stopWhen，循环就一步（问模型）
 *   - reasoning：无 tools、有 thinking，循环也一步
 *   - structured：streamText + Output.object 强约束吐 JSON，无 tools
 *   - agent-loop：第一次把 tools + stopWhen 接进来，循环不止一步，库内转圈
 *     这是 step-2 里第一次真正演示「AI SDK 把 Reason → Act → Observe 收走」的样子。
 *
 * 工具 execute 在服务端运行（VercelAI SDK 7.x 默认服务端执行 tool）。
 *   useReasoningMiddleware 必须关：minimax 这条 OpenAI 路径如果开了 extractReasoningMiddleware，
 *   会把工具返回的 JSON 拆进 reasoning 段，UI 消息流就拿不到完整 tool-result。
 */
import type { ServerResponse } from "node:http";
import {
  pipeUIMessageStreamToResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  tool,
  zodSchema,
} from "ai";
import { z } from "zod";
import {
  type ProductionProviderId,
  getLlmForProvider,
} from "../../../../llm.js";
import { createModel, type Protocol } from "../cafe/model.js";
import { logger } from "../logger.js";

// ── 工具定义（mock，不真做咖啡） ────────────────────────────────────────
// 暴露 readMenu / makeLatte 两个 mock 工具；mock 是教学目的，不是为了冒充模型（§5.3.0）。
// 真实业务里这两个工具会查后端菜单服务、让吧台做咖啡；本课只让模型「真调用了」这件事可见。

const MOCK_MENU = {
  date: "2026-09-21",
  drinks: [
    { id: "latte", name: "拿铁（热/冰）", available: true },
    { id: "americano", name: "美式（热/冰）", available: true },
    { id: "matcha-latte", name: "抹茶拿铁", available: false },
  ],
};

type MakeLatteArgs = { size: "small" | "medium" | "large"; temp: "hot" | "iced" };

export const readMenu = tool({
  description: "读今日 cafe://today-menu 资源，返回当日可做的饮品清单。",
  inputSchema: zodSchema(z.object({})),
  execute: async (): Promise<typeof MOCK_MENU> => {
    return MOCK_MENU;
  },
});

export const makeLatte = tool({
  description: "让吧台做一杯指定规格的拿铁。",
  inputSchema: zodSchema(z.object({
    size: z.enum(["small", "medium", "large"]).describe("杯量"),
    temp: z.enum(["hot", "iced"]).describe("温度"),
  })),
  execute: async (input: MakeLatteArgs): Promise<{
    ok: true;
    drinkId: string;
    size: MakeLatteArgs["size"];
    temp: MakeLatteArgs["temp"];
    etaMinutes: number;
  }> => {
    return {
      ok: true,
      drinkId: "drink-" + Date.now(),
      size: input.size,
      temp: input.temp,
      etaMinutes: 3,
    };
  },
});

// ── 入口 ────────────────────────────────────────────────────────────────
export type AgentLoopMode = "default" | "stopWhen3";

export async function pipeAgentLoop(
  query: string,
  providerId: ProductionProviderId,
  protocol: Protocol,
  mode: AgentLoopMode,
  response: ServerResponse,
  abortSignal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  const llm = getLlmForProvider(providerId);
  if (!llm) {
    throw new Error(`提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`);
  }
  logger.info(
    "pipeAgentLoop",
    "调用函数：pipeAgentLoop",
    `provider=${providerId} · protocol=${protocol} · mode=${mode} · 一次 streamText 把工具循环跑完；循环圈数受 stopWhen 控制。`,
    {},
  );
  logger.info("pipeAgentLoop", "调用函数：pipeAgentLoop", "记下这一次的 query + provider + protocol + mode + 模型 id + baseURL。", {
    入参: { query, providerId, protocol, mode, modelA: llm.modelA, baseUrlA: llm.baseUrlA, modelB: llm.modelB, baseUrlB: llm.baseUrlB, maxTokensB: llm.maxTokensB },
  });

  // 工具循环也开 useReasoningMiddleware：minimax 这条 OpenAI 路径默认把 reasoning 写在 text 里
  // 包 `<think>...</think>`，不开中间件会污染「模型最终正文」段；开了之后 reasoning 拆成独立段，
  // 浏览器侧走 reasoning-delta 进 reasoning 折叠区，text-delta 只剩真正正文。
  const model = createModel(providerId, protocol, { useReasoningMiddleware: true });
  // mode="default" 不传 stopWhen → SDK 默认 stepCountIs(1)；
  // mode="stopWhen3" 显式 stopWhen: stepCountIs(3) → 最多跑 3 步。
  const stopWhen = mode === "stopWhen3" ? stepCountIs(3) : undefined;
  logger.info("pipeAgentLoop", "调用函数：pipeAgentLoop", "函数体：createModel → 拼 stopWhen → streamText({ tools, stopWhen }) → 推 UI 消息流。", {
    __code: pipeAgentLoop.toString(),
  });

  // Anthropic 协议下要开原生 thinking blocks + maxTokens > budgetTokens。
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
      ? (providerId === "minimax" ? "openai(无中间件，工具直调)" : "openai-compatible(createOpenAICompatible)")
      : "anthropic(原生 thinking blocks)",
    modelId: protocol === "openai" ? llm.modelA : llm.modelB,
    baseURL: protocol === "openai" ? llm.baseUrlA : `${llm.baseUrlB}/v1/messages`,
    prompt: query,
    tools: { readMenu: "（已注册：读今日菜单）", makeLatte: "（已注册：做一杯拿铁）" },
    stopWhen: mode === "stopWhen3" ? "stepCountIs(3)" : "未传 → 默认 stepCountIs(1)",
    ...anthropicThinking,
  };
  logger.info(
    "│ streamText",
    "调用模型：streamText + tools + stopWhen",
    `provider=${providerId} · protocol=${protocol} · mode=${mode} · 真发网络请求；循环在库内转圈，stopWhen 控制圈数。`,
    { 入参 },
  );

  try {
    const result = streamText({
      model,
      prompt: query,
      tools: { readMenu, makeLatte },
      stopWhen,
      abortSignal,
      ...anthropicThinking,
      onError: ({ error }) => {
        logger.error("│ streamText", "结束：streamText（失败）", "把 AI SDK 内部异常原文落日志，不让它被包成 An error occurred。", {
          返回值: { name: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error) },
        });
      },
      onFinish: ({ steps, text, finishReason, usage }) => {
        logger.info("│ streamText", "结束：streamText", `protocol=${protocol} · provider=${providerId} · mode=${mode} · 库内循环跑完。`, {
          耗时ms: Date.now() - started,
          返回值: { stepCount: steps.length, text, finishReason, usage },
        });
      },
    });

    await pipeUIMessageStreamToResponse({
      response,
      stream: toUIMessageStream({ stream: result.stream }),
    });
    logger.info("pipeAgentLoop", "结束：pipeAgentLoop", `protocol=${protocol} · provider=${providerId} · mode=${mode} 流已写入。`, {
      耗时ms: Date.now() - started,
      返回值: { streamed: true },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("pipeAgentLoop", "结束：pipeAgentLoop（失败）", "streamText 抛错；把原文回浏览器。", {
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