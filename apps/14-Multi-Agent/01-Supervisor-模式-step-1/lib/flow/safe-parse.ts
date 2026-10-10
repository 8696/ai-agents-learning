/**
 * 职责：supervisor.ts 三次 LLM 调用（店长 / 工人 / finish）通用的 JSON 解析（含 <think> 与 ``` 围栏剥除 + safeParse）。
 * 数据流：LLM content → stripThinkNoise → JSON.parse → zod safeParse → typed result / safeParse error。
 *
 * 为什么单独成文件：supervisor.ts 锁后加固加 ~100 行解析逻辑 → 抽出本文件让 supervisor.ts 退回 ≤280 行（§5.3.8）。
 * 本地独立副本（不跨小节 import）：step-2 lib/flow/schemas.ts 也有一份同名 safeJsonParse，互不 import。
 */
import { z } from "zod-v4";
import { logger } from "../logger.js";

export class LlmResponseNotJsonError extends Error {
  readonly rawContent: string;
  readonly stripped: string;
  constructor(rawContent: string, stripped: string) {
    super("LLM 响应里找不到 JSON 段（已剥 <think> 与 ``` 围栏）：" + stripped.slice(0, 200));
    this.name = "LlmResponseNotJsonError";
    this.rawContent = rawContent;
    this.stripped = stripped;
  }
}

export function stripThinkNoise(raw: string): string {
  const noThink = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fenced = noThink.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : noThink;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return candidate.slice(first, last + 1);
  }
  throw new LlmResponseNotJsonError(raw, candidate);
}

export async function safeJsonParse<T>(
  schema: z.ZodType<T>,
  rawContent: string,
  who: string,
): Promise<T> {
  let stripped: string;
  try {
    stripped = stripThinkNoise(rawContent);
  } catch (e) {
    if (e instanceof LlmResponseNotJsonError) {
      logger.error(
        "│ │ 调用模型-openai.chat.completions",
        `${who} LLM 响应不是 JSON`,
        "为什么写这条日志：模型吐了纯中文（或其它非 JSON 内容），json_schema strict 没拦住。当前：stripThinkNoise 抛错。",
        { rawContent: rawContent.slice(0, 500), strippedPreview: e.stripped.slice(0, 200) },
      );
    }
    throw e;
  }
  const parsed = schema.safeParse(JSON.parse(stripped));
  if (!parsed.success) {
    logger.error(
      "│ │ 调用模型-openai.chat.completions",
      `${who} LLM 响应缺字段`,
      "为什么写这条日志：json_schema strict 应该挡住，但 minimax 这条 OpenAI 路径有时仍返回残缺 JSON（实测遇到过）。当前：safeParse 失败，把 issues 一起抛出便于定位。",
      { rawContent: rawContent.slice(0, 500), stripped: stripped.slice(0, 500), issues: parsed.error.issues },
    );
    throw new Error(`${who} LLM 响应缺字段：${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}
