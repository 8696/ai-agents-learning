/**
 * 职责：协议 A 两次闸门调用共用的响应形状。
 * 数据流：run-json-mode / run-structured → 这个类型 → route 原样写 ctx.body。
 * 为什么单独成文件：两页对照看的是同一组字段（raw / parsed / analysis），
 *   形状散在两个 flow 里，前端卡片就要写两套分支。
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

export type ModeCallResult = {
  mode: "json_object" | "json_schema_strict";
  raw: string;
  parseOk: boolean;
  parsed: Intent | null;
  /** Zod / JSON.parse 失败时的人话 issues；成功为 null。前端靠它显示「为什么 ✗」。 */
  parseError: string | null;
  analysis: Analysis;
  elapsedMs: number;
};
