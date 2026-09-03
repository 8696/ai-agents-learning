/**
 * 职责：对照页共用的 meta 帧 + 实测归类（协议无关）。
 * 数据流：DialectCard + 这一轮 sources[] → SSE `meta` / `thinking-map.returnShape`。
 * 为什么单独成文件：A/B 开法不同，但「告诉页面这次怎么开、思考从哪回来」是同一张对照卡。
 */
import type { Llm } from "../../../../llm.js";
import { getCatalogLabel } from "../../../../llm.js";
import type { DialectCard } from "../dialect/thinking-dialect.js";
import type { SseWriter } from "../http/sse-writer.js";

export function classifyReturnShape(
  sources: string[],
): "separate_field" | "in_content" | "both" | "none" {
  const separate = sources.some(
    (s) => s === "reasoning_details" || s === "reasoning_content" || s === "delta.thinking",
  );
  const inContent = sources.includes("content_think_tag");
  if (separate && inContent) return "both";
  if (separate) return "separate_field";
  if (inContent) return "in_content";
  return "none";
}

/**
 * 第一帧 meta：官方怎么开/关 + 这次请求里真正带上的开关字段。
 * 必须在任何 thinking/content 增量之前发出，页面才能先展示「计划」，再对照「实测」。
 */
export function writeMeta(
  writer: SseWriter,
  opts: {
    llm: Llm;
    protocol: "A" | "B";
    request: unknown;
    explain: DialectCard;
    switchSnippet: unknown;
    skipped?: string;
  },
): boolean {
  return writer.frame({
    type: "meta",
    protocol: opts.protocol,
    provider: opts.llm.provider,
    label: getCatalogLabel(opts.llm.provider),
    sdk: opts.protocol === "A" ? "openai" : "@anthropic-ai/sdk",
    method: opts.protocol === "A" ? "chat.completions.create" : "messages.stream",
    baseURL: opts.protocol === "A" ? opts.llm.baseUrlA : opts.llm.baseUrlB,
    model: opts.protocol === "A" ? opts.llm.modelA : opts.llm.modelB,
    request: opts.request,
    skipped: Boolean(opts.skipped),
    skipReason: opts.skipped ?? "",
    thinkingExplain: {
      howEnabled: opts.explain.howOn,
      howDisabled: opts.explain.howOff,
      defaultOn: opts.explain.defaultOn,
      canDisable: opts.explain.canDisable,
      returnField: opts.explain.returnField,
      notes: opts.explain.notes,
    },
    switchSnippet: opts.switchSnippet,
  });
}
