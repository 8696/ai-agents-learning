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
import { logger } from "../logger.js";

export async function runTextNoTools(llm: Llm, prompt: string): Promise<ModeCallResult> {
  const t0 = performance.now();

  // ① 没有 tools：模型只能吐纯文本。JSON 合法性全靠这段 prompt，没有 API 字段保。
  const requestBody = {
    model: llm.modelB,
    max_tokens: llm.maxTokensB,
    messages: [
      {
        role: "user" as const,
        content:
          `${prompt}\n\n` +
          `只返回一个合法 JSON 对象，结构 { action: "search"|"order"|"cancel", query: string, qty?: number }。` +
          `不要 markdown fence，不要解释，不要前缀。`,
      },
    ],
  };
  logger.info(
    "llm.request.text",
    "→ 协议 B · 无 tools 路径 · 进入 messages.create",
    "协议 B 没有 response_format 开关；这是「JSON Mode 等价路径」，全靠 prompt 强约束。这一步把完整 requestBody 打出来，便于核对 model / max_tokens / messages 拼接（prompt + 结构指令 + 字段说明）。",
    {
      provider: llm.provider,
      baseUrlB: llm.baseUrlB,
      model: llm.modelB,
      maxTokens: llm.maxTokensB,
      messagesCount: requestBody.messages.length,
      hasTools: false,
      toolChoice: null,
      inputSchema: null,
      promptPreview: prompt.slice(0, 200),
      __code: JSON.stringify(requestBody, null, 2),
    },
  );

  const res = await llm.anthropic.messages.create(requestBody);

  logger.info(
    "llm.response.text",
    "← got response（协议 B · 无 tools）",
    "完整打响应便于核对 SDK 自带字段：stop_reason / model / content[]（注意：text 路径模型可能夹 markdown fence / think 块，剥壳在 safeParseIntent）。同时打 usage 便于对照 token 损耗。",
    res,
  );

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
