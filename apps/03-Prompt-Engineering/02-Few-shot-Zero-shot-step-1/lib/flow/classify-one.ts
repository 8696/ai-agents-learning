/**
 * 职责：用某一种 shot 模式写一次协议 A，再把原文交给 judge 判格式。
 * 数据流：{ llm, mode, text } → chat.completions.create → judgeFormat → ClassifyRow。
 * ① 拼 messages 时 Zero 绝不能带教案、Few 必须带 4 对假对话，顺序不能换。
 * ② temperature 固定 0：本条比的是「有没有样例」，不是采样随机性。
 *
 * 日志（§5.3.16）：调用函数 五条日志（classifyOne 封装层），调用模型 五条日志（真正发网络请求的那一层，含 __code + 字段释义）。
 */
import type { Llm } from "../../../../llm.js";
import type OpenAI from "openai";
import { FEW_SHOT_TURNS, SYSTEM_PROMPT } from "../classify/presets.js";
import { judgeFormat } from "../classify/judge.js";
import type { ClassifyRow, ShotMode } from "../classify/types.js";
import { logger } from "../logger.js";

function buildMessages(
  mode: ShotMode,
  text: string,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const current: OpenAI.Chat.ChatCompletionMessageParam = {
    role: "user",
    content: text,
  };
  if (mode === "zero") {
    return [{ role: "system", content: SYSTEM_PROMPT }, current];
  }
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...FEW_SHOT_TURNS,
    current,
  ];
}

function httpErrorMessage(error: unknown): { status: number; message: string } {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    const message =
      error instanceof Error ? error.message : String((error as { message?: unknown }).message ?? error);
    return {
      status: typeof status === "number" ? status : 502,
      message,
    };
  }
  if (error instanceof Error) {
    return { status: 502, message: error.message };
  }
  return { status: 502, message: String(error) };
}

export async function classifyOne(input: {
  llm: Llm;
  mode: ShotMode;
  text: string;
}): Promise<ClassifyRow> {
  const tFuncStart = Date.now();
  const messages = buildMessages(input.mode, input.text);
  const fewShotCount = input.mode === "few" ? FEW_SHOT_TURNS.length : 0;

  logger.info(
    "│ 单条分类-classifyOne",
    "调用函数开始：classifyOne",
    "为什么写这条日志：classifyModes 只认这一层返回的 ClassifyRow；里面那次才是真发网络请求（看「调用模型开始：协议A-对话补全」）。当前：即将按 mode 拼 messages；Zero 不带教案 / Few 带 4 对假对话。",
    {
      入参: { mode: input.mode, textPreview: input.text.slice(0, 50), textLen: input.text.length, fewShotCount, messagesCount: messages.length },
      __code: `const request = { model: llm.modelA, temperature: 0, max_tokens: 200, messages };\nconst completion = await llm.openai.chat.completions.create(request);`,
    },
  );

  const request = {
    model: input.llm.modelA,
    temperature: 0,
    max_tokens: 200,
    messages,
  };

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 choices[0].message.content / usage。当前：即将发出请求；mode 决定是否拼 few-shot 教案；temperature=0 排除采样随机性只比「有没有样例」。",
    {
      入参: {
        model: request.model,
        mode: input.mode,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        messagesCount: request.messages.length,
        fewShotCount,
        zeroShot: input.mode === "zero",
      },
      __code: `await input.llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const completion = await input.llm.openai.chat.completions.create(request);
    logger.info(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全",
      "为什么写这条日志：要拿 choices[0].message.content / usage（计费依据），下游还要过 judgeFormat 判格式。当前：await 已返回。",
      {
        返回值: {
          id: completion.id,
          model: completion.model,
          finishReason: completion.choices?.[0]?.finish_reason,
          usage: completion.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "choices[0].finish_reason": "stop=正常 / length=撞 max_tokens / content_filter=策略拦下",
          usage: "OpenAI 标准 usage 三字段（计费依据）",
        },
      },
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    const judged = judgeFormat(raw);
    logger.info(
      "│ 单条分类-classifyOne",
      "调用函数结束：classifyOne",
      "为什么写这条日志：classifyModes 要把 ClassifyRow 收齐后并排对照；打 judge 结果便于事后核对「Zero vs Few 谁更 valid」。当前：judgeFormat 已返回。",
      {
        返回值: {
          mode: input.mode,
          ok: true,
          formatValid: judged.formatValid,
          hadThinking: judged.hadThinking,
          rawPreview: raw.slice(0, 100),
          rawLen: raw.length,
        },
        耗时ms: Date.now() - tFuncStart,
        字段释义: {
          formatValid: "judgeFormat 通过 Zod 校验的结果（true=JSON 合规）",
          hadThinking: "raw 里是否带了 <think>...</think> 标记（部分模型会这样输出）",
        },
      },
    );
    return { mode: input.mode, ok: true, raw, ...judged };
  } catch (error: unknown) {
    const mapped = httpErrorMessage(error);
    logger.error(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全（失败）",
      "为什么写这条日志：拿到 mappedStatus 才能区分 401/403（Key）、429（限流）、5xx；未识别 → 502。当前：create 抛错，classifyModes 的 allSettled 会兜住。",
      {
        返回值: { mappedStatus: mapped.status, message: mapped.message },
        耗时ms: Date.now() - tModelStart,
        错误: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      },
    );
    logger.error(
      "│ 单条分类-classifyOne",
      "调用函数结束：classifyOne（失败）",
      "为什么写这条日志：失败也要按 ClassifyRow 形状回收，便于 classifyModes 并排展示。当前：模型抛错，已转 { ok:false, status, error }。",
      {
        返回值: { mode: input.mode, ok: false, status: mapped.status, error: mapped.message },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return {
      mode: input.mode,
      ok: false,
      status: mapped.status,
      error: mapped.message,
    };
  }
}