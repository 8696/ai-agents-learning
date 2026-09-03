/**
 * 职责：协议 B 两次路径共用的响应形状。
 * 数据流：run-text / run-tool-use → 这个类型 → route 原样写 ctx.body。
 * 为什么单独成文件：两页对照看的是同一组字段；tool-use 额外带 toolUse 块元信息。
 */
import type { Intent } from "../schema/intent.js";

export type ParseResult =
  | { ok: true; data: Intent }
  | { ok: false; error: string };

export type Analysis = {
  hasMarkdownFence: boolean;
  hasThinkTag: boolean;
  parseOk: boolean;
  keysSeen: string[];
  expectedKeys: string[];
  missingKeys: string[];
  extraKeys: string[];
  rawLength: number;
  promptLength: number;
};

export type ToolUseMeta = { id: string; name: string };

export type ModeCallResult = {
  mode: "text_no_tools" | "tool_use_forced";
  raw: string;
  parseOk: boolean;
  parsed: Intent | null;
  parseError: string | null;
  analysis: Analysis;
  elapsedMs: number;
  toolUse?: ToolUseMeta | null;
};
