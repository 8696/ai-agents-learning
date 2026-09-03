/**
 * 职责：用某一种 shot 模式打一次协议 A，再把原文交给 judge 判格式。
 * 数据流：{ llm, mode, text } → chat.completions.create → judgeFormat → ClassifyRow。
 * ① 拼 messages 时 Zero 绝不能带教案、Few 必须带 4 对假对话，顺序不能换。
 * ② temperature 固定 0：本条比的是「有没有样例」，不是采样随机性。
 */
import type { Llm } from "../../../../llm.js";
import type OpenAI from "openai";
import { FEW_SHOT_TURNS, SYSTEM_PROMPT } from "../classify/presets.js";
import { judgeFormat } from "../classify/judge.js";
import type { ClassifyRow, ShotMode } from "../classify/types.js";

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
  try {
    const completion = await input.llm.openai.chat.completions.create({
      model: input.llm.modelA,
      temperature: 0,
      max_tokens: 200,
      messages: buildMessages(input.mode, input.text),
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const judged = judgeFormat(raw);
    return { mode: input.mode, ok: true, raw, ...judged };
  } catch (error: unknown) {
    const mapped = httpErrorMessage(error);
    return {
      mode: input.mode,
      ok: false,
      status: mapped.status,
      error: mapped.message,
    };
  }
}
