/**
 * 职责：某一版 Prompt 打一次协议 A，并算出长度 / 推理标记 / preview。
 * 数据流：{ llm, mode, text, promptSuffix } → chat.completions.create → CompareRow。
 * ① User = promptSuffix + "\\n\\n问题：" + text，两版只换 suffix。
 * ② temperature 固定 0：本条比的是 Prompt 文本，不是采样随机性。
 */
import type { Llm } from "../../../../llm.js";
import { SYSTEM_PROMPT } from "../version/presets.js";
import type { Mode } from "../version/presets.js";
import { detectReasoning, previewLine } from "../version/detect.js";

export type CompareOk = {
  mode: Mode;
  ok: true;
  raw: string;
  textLen: number;
  hasReasoning: boolean;
  preview: string;
};

export type CompareFail = {
  mode: Mode;
  ok: false;
  status: number;
  error: string;
};

export type CompareRow = CompareOk | CompareFail;

function httpErrorMessage(error: unknown): { status: number; message: string } {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    const message =
      error instanceof Error
        ? error.message
        : String((error as { message?: unknown }).message ?? error);
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

export async function runOne(input: {
  llm: Llm;
  mode: Mode;
  text: string;
  promptSuffix: string;
}): Promise<CompareRow> {
  try {
    const completion = await input.llm.openai.chat.completions.create({
      model: input.llm.modelA,
      temperature: 0,
      max_tokens: 500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${input.promptSuffix}\n\n问题：${input.text}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    return {
      mode: input.mode,
      ok: true,
      raw,
      textLen: raw.length,
      hasReasoning: detectReasoning(raw),
      preview: previewLine(raw),
    };
  } catch (error: unknown) {
    const mapped = httpErrorMessage(error);
    return { mode: input.mode, ok: false, status: mapped.status, error: mapped.message };
  }
}
