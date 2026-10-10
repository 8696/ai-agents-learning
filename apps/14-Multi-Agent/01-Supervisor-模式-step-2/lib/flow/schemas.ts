/**
 * 职责：Orchestrator-Workers 三段流水线的 Zod schema + JSON 解析（含 <think> / ``` 围栏剥除）。
 * 数据流：LLM content → stripThinkNoise → JSON.parse → zod safeParse → typed result / safeParse error。
 */
import { z } from "zod-v4";
import { logger } from "../logger.js";

export const orchestratorSchema = z.object({
  tasks: z.array(z.object({ drink: z.string().min(1) })).min(1).max(10),
  reasoning: z.string().min(1),
});

export const workerSchema = z.object({
  // 严格 boolean；null 容错在 safeJsonParse 里通过「null→false 替换」处理（minimax 路径偶发返 null）
  available: z.boolean(),
  note: z.string().min(1),
  reasoning: z.string().min(1),
});

export const aggregatorSchema = z.object({
  guestReply: z.string().min(1),
  reasoning: z.string().min(1),
});

/**
 * 剥 <think>...</think> 噪声块（MiniMax 直调 OpenAI 路径默认把 reasoning 写在 content 里 —— P-031）。
 * 再剥 ```json ... ``` markdown 代码栅栏。
 * 兜底：从第一个 { 到最后一个 } 截取 JSON 段；找不到抛错带原始内容前 200 字。
 */
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

export async function safeJsonParse<T>(schema: z.ZodType<T>, rawContent: string, who: string): Promise<T> {
  let stripped: string;
  try {
    stripped = stripThinkNoise(rawContent);
  } catch (e) {
    if (e instanceof LlmResponseNotJsonError) {
      logger.error(
        "││ 调用模型-openai.chat.completions",
        `${who} LLM 响应不是 JSON`,
        "为什么写这条日志：模型吐了纯中文，json_schema strict 没拦住。当前：stripThinkNoise 抛错。",
        { rawContent: rawContent.slice(0, 500) },
      );
    }
    throw e;
  }
  // 容错：minimax 路径偶发把 boolean 字段返成 null；解析前先转 false
  // （避免改 zod schema 引入 union —— union 在 json_schema strict 下会被 API 拒）
  const tolerant = stripped
    .replace(/"available"\s*:\s*null/g, '"available": false')
    .replace(/"nextWorker"\s*:\s*null/g, '"nextWorker": "menu"')
    .replace(/"drinkType"\s*:\s*null/g, '"drinkType": "hot"');
  const parsed = schema.safeParse(JSON.parse(tolerant));
  if (!parsed.success) {
    logger.error(
      "││ 调用模型-openai.chat.completions",
      `${who} LLM 响应缺字段`,
      "为什么写这条日志：json_schema strict 应该挡住，但 minimax 这条 OpenAI 路径有时仍返回残缺 JSON。",
      { rawContent, stripped, issues: parsed.error.issues },
    );
    throw new Error(`${who} LLM 响应缺字段：${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
}
