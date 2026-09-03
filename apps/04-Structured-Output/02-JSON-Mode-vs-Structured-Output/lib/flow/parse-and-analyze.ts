/**
 * 职责：把模型吐回的字符串剥壳 → JSON.parse → Zod，并做字面分析（keys / fence / think）。
 * 数据流：raw string → stripWrap → ParseResult + Analysis。
 * 为什么同文件：剥壳、parse、数 keys 必须共用同一条 stripWrap，
 *   否则会出现「Zod ✓ 但 keysSeen 为空」这种自相矛盾。
 */
import { ALLOWED_KEYS, EXPECTED_KEYS, IntentZod } from "../schema/intent.js";
import type { Analysis, ParseResult } from "./measure-types.js";

/**
 * 模型吐回的字符串经常被三种 wrapper 包住，先剥掉再 JSON.parse / 数 keys。
 *   - &lt;think&gt;...&lt;/think&gt;  思维链前缀（推理模式普遍带）
 *   - ```json ... ```   markdown fence（JSON Mode 常见，strict 理论上不该出现）
 *   - 末尾 "..." 省略号
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

/** ① 先剥壳 ② JSON.parse（失败就停，别拿半截去 Zod） ③ Zod 出 issues 列表。 */
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

/**
 * 字面分析：给前端 5 秒看懂「两种闸差在哪」。
 * 不挑算法，挑事实：夹没夹 fence、看见哪些 key、缺没缺、多没多。
 */
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
    /* JSON.parse 失败时 keysSeen 为空，正常 */
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
