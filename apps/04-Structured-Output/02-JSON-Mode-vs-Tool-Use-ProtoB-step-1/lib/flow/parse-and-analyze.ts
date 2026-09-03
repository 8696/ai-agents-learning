/**
 * 职责：把模型吐回的字符串剥壳 → JSON.parse → Zod，并做字面分析（keys / fence / think）。
 * 数据流：raw string 或已解析 object → ParseResult + Analysis。
 * 为什么同文件：剥壳、parse、数 keys 必须共用同一条 stripWrap；
 *   tool-use 路径 input 已是对象，走 safeParseIntentObject，不要再 JSON.parse 一轮。
 */
import { ALLOWED_KEYS, EXPECTED_KEYS, IntentZod } from "../schema/intent.js";
import type { Analysis, ParseResult } from "./measure-types.js";

/**
 * 与协议 A 同构的剥离链（本份自己实现，禁止跨小节 import）：
 *   think 块 / markdown fence / 末尾省略号。
 * 每一步后面都 .trim()：剥掉 think 之后可能剩 \n```json…，开头 \n 会让下个 ^``` 正则匹配不到。
 */
export function stripWrap(raw: string): string {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*\n?/i, "").trim();
  s = s.replace(/\n?```\s*$/i, "").trim();
  s = s.replace(/\.{3,}\s*$/, "").trim();
  return s;
}

/** ① 先剥壳 ② JSON.parse（失败就停） ③ Zod。text 路径走这条。 */
export function safeParseIntent(raw: string): ParseResult {
  const cleaned = stripWrap(raw);
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, error: `JSON.parse 失败: ${(e as Error).message}` };
  }
  return safeParseIntentObject(obj);
}

/** tool-use.input 已经是对象：不要 stringify 再 parse，会把 undefined 弄丢。 */
export function safeParseIntentObject(obj: unknown): ParseResult {
  const r = IntentZod.safeParse(obj);
  if (!r.success) {
    return {
      ok: false,
      error: r.error.issues
        .map((i) => `${(i.path as (string | number)[]).join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, data: r.data };
}

export function analyze(
  raw: string,
  parsedResult: ParseResult,
  prompt: string,
): Analysis {
  const cleaned = stripWrap(raw);
  const keysSeen = new Set<string>();
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const k of Object.keys(obj as Record<string, unknown>)) {
        keysSeen.add(k);
      }
    }
  } catch {
    /* ignore */
  }
  return {
    hasMarkdownFence: raw.includes("```"),
    hasThinkTag: /<think>/i.test(raw),
    parseOk: parsedResult.ok,
    keysSeen: Array.from(keysSeen).sort(),
    expectedKeys: [...EXPECTED_KEYS],
    missingKeys: EXPECTED_KEYS.filter((k) => !keysSeen.has(k)),
    extraKeys: Array.from(keysSeen).filter(
      (k) => !(ALLOWED_KEYS as readonly string[]).includes(k),
    ),
    rawLength: raw.length,
    promptLength: prompt.length,
  };
}

/** 已是对象时直接数 keys，供 tool-use 路径用。 */
export function analyzeObject(
  obj: unknown,
  parsedResult: ParseResult,
  prompt: string,
): Analysis {
  const raw = JSON.stringify(obj ?? null, null, 2);
  const keysSeen = new Set<string>();
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const k of Object.keys(obj as Record<string, unknown>)) {
      keysSeen.add(k);
    }
  }
  return {
    hasMarkdownFence: false,
    hasThinkTag: false,
    parseOk: parsedResult.ok,
    keysSeen: Array.from(keysSeen).sort(),
    expectedKeys: [...EXPECTED_KEYS],
    missingKeys: EXPECTED_KEYS.filter((k) => !keysSeen.has(k)),
    extraKeys: Array.from(keysSeen).filter(
      (k) => !(ALLOWED_KEYS as readonly string[]).includes(k),
    ),
    rawLength: raw.length,
    promptLength: prompt.length,
  };
}
