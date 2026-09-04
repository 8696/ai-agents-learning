/**
 * 职责：用某一种 shot 模式打一次协议 A，再把原文交给 judge 判格式。
 * 数据流：{ llm, mode, text } → chat.completions.create → judgeFormat → ClassifyRow。
 * ① 拼 messages 时 Zero 绝不能带教案、Few 必须带 4 对假对话，顺序不能换。
 * ② temperature 固定 0：本条比的是「有没有样例」，不是采样随机性。
 *
 * 日志（§5.3.16）：本文件是 LLM 调用的物理落点；
 *   llm.request / llm.response / llm.error 三段打点，data 带 meta + __code 便于核对请求体。
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
  const messages = buildMessages(input.mode, input.text);
  const fewShotCount = input.mode === "few" ? FEW_SHOT_TURNS.length : 0;

  logger.info(
    "classify.entry",
    `→ classifyOne (${input.mode})`,
    `进入单条分类流程；记 mode + 文本长度 + few-shot 教案条数，便于对照 Zero/Few 的入参差异`,
    {
      mode: input.mode,
      textLen: input.text.length,
      fewShotCount,
      messagesCount: messages.length,
    },
  );

  const request = {
    model: input.llm.modelA,
    temperature: 0,
    max_tokens: 200,
    messages,
  };

  logger.info(
    "llm.request",
    `→ openai.chat.completions.create (${input.mode})`,
    `发起一次协议 A 分类调用；mode 决定是否拼 4 对假对话（Few=有 / Zero=无），temperature=0 是固定采样为了排除随机性、只比「有没有样例」；记 meta + 完整 request JSON 便于核对模型收到的消息结构`,
    {
      model: request.model,
      mode: input.mode,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      messagesCount: messages.length,
      fewShotCount,
      zeroShot: input.mode === "zero",
      __code: `await input.llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const completion = await input.llm.openai.chat.completions.create(request);
    logger.info(
      "llm.response",
      "← got response",
      "完整打响应便于核对 SDK 自带字段（id / choices / usage / finish_reason），不挑字段；下游还要过 judgeFormat 判格式",
      completion,
    );
    const raw = completion.choices[0]?.message?.content ?? "";
    const judged = judgeFormat(raw);
    logger.info(
      "classify.judge",
      `judgeFormat → ${judged.formatValid ? "valid" : "invalid"}`,
      `Zod 校验结果；formatValid=false 通常是模型没按 JSON 模板输出或带了思考块；记 hadThinking + formatError 便于判断是哪种问题`,
      {
        mode: input.mode,
        hadThinking: judged.hadThinking,
        formatValid: judged.formatValid,
        formatError: judged.formatError,
        rawLen: raw.length,
      },
    );
    return { mode: input.mode, ok: true, raw, ...judged };
  } catch (error: unknown) {
    const mapped = httpErrorMessage(error);
    logger.error(
      "llm.error",
      `openai.chat.completions.create threw (${input.mode})`,
      "协议 A 抛异常（网络 / 5xx / 4xx / Key 错）；记 mappedStatus + err 便于排错（状态码已按 OpenAI 错误结构映射，502 表示未识别）",
      {
        mode: input.mode,
        mappedStatus: mapped.status,
        err: mapped.message,
        errObject: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
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
