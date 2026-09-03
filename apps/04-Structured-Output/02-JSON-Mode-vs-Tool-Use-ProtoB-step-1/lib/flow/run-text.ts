/**
 * 职责：协议 B 的「JSON Mode 等价路径」——无 tools，纯文本 + prompt 强约束。
 * 数据流：{ llm, prompt } → anthropic.messages.create（不带 tools）→ 拼 text 块 → parse。
 * 为什么单独成文件：协议 B 没有 response_format。这一刀只能靠 prompt，
 *   和 tool-use 混在一个函数里，读者会以为 Anthropic 也有 json_object 开关。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { ModeCallResult } from "./measure-types.js";
import { analyze, safeParseIntent } from "./parse-and-analyze.js";

export async function runTextNoTools(llm: Llm, prompt: string): Promise<ModeCallResult> {
  const t0 = performance.now();

  // ① 没有 tools：模型只能吐纯文本。JSON 合法性全靠这段 prompt，没有 API 字段保。
  const res = await llm.anthropic.messages.create({
    model: llm.modelB,
    max_tokens: llm.maxTokensB,
    messages: [
      {
        role: "user",
        content:
          `${prompt}\n\n` +
          `只返回一个合法 JSON 对象，结构 { action: "search"|"order"|"cancel", query: string, qty?: number }。` +
          `不要 markdown fence，不要解释，不要前缀。`,
      },
    ],
  });

  // ② 协议 B 响应 shape: content: ContentBlock[]。用 for-of 让 discriminated union 收窄。
  let raw = "";
  for (const block of res.content) {
    if (block.type === "text") raw += block.text;
  }
  console.log(`  /api/text raw: ${raw.slice(0, 400)}${raw.length > 400 ? "..." : ""}`);

  const parsedResult = safeParseIntent(raw);

  return {
    mode: "text_no_tools",
    raw,
    parseOk: parsedResult.ok,
    parsed: parsedResult.ok ? parsedResult.data : null,
    parseError: parsedResult.ok ? null : parsedResult.error,
    analysis: analyze(raw, parsedResult, prompt),
    elapsedMs: Math.round(performance.now() - t0),
  };
}
