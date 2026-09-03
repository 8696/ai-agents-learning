/**
 * 职责：把模型吐出的纯文本判定成 SYSTEM_WIN / USER_WIN / REMEMBERED / FORGOT / PARTIAL。
 * 数据流：text → Verdict；不 import 任何 SDK，A/B 共用同一套尺子。
 * 为什么：对照的是「同一段输出怎么判」，不是「哪家 SDK 怎么调」。
 */
import type { Verdict } from "./types.js";

export const VERDICT_LABEL: Record<Verdict, string> = {
  SYSTEM_WIN: "✅ System 生效（输出 JSON）",
  USER_WIN: "❌ User 覆盖（没出 JSON）",
  REMEMBERED: "✅ 记得（北京出现）",
  FORGOT: "❌ 失忆 / 瞎猜 / 反问",
  PARTIAL: "⚠️  妥协（既有 JSON 又有 JSON 外的散文）",
};

/**
 * 协议 A 常把思考嵌进 content 字符串。API 不给关，适配层自己剥。
 * ① 从开头一路吃到每个闭合思考标记：思考不是优先级问题，先拿掉再判。
 */
export function stripThink(text: string): string {
  const close = "<" + "/think>";
  let out = text;
  let idx = out.indexOf(close);
  while (idx !== -1) {
    out = out.slice(idx + close.length);
    idx = out.indexOf(close);
  }
  return out.trim();
}

/**
 * Case 1：System 要 JSON-only，User 要长文段。
 * ② 先剥思考，再找带 reply 的 JSON，再看 JSON 外还剩不剩散文。
 * 判错会怎样：把思考污染当成 USER_WIN，会误以为「System 没生效」。
 */
export function judgeCase1(text: string): Verdict {
  const withoutThink = stripThink(text);
  const jsonMatch = withoutThink.match(/\{[\s\S]*?"reply"[\s\S]*?\}/);
  let hasValidJson = false;
  if (jsonMatch) {
    try {
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "reply" in parsed &&
        typeof (parsed as { reply: unknown }).reply === "string"
      ) {
        hasValidJson = true;
      }
    } catch {
      /* JSON 残骸不算 System 赢 */
    }
  }
  const proseOnly = withoutThink
    .replace(/\{[\s\S]*?"reply"[\s\S]*?\}/g, "")
    .trim();
  const hasProseOutside = proseOnly.length > 20;

  if (hasValidJson && !hasProseOutside) return "SYSTEM_WIN";
  if (hasValidJson && hasProseOutside) return "PARTIAL";
  if (!hasValidJson && proseOnly.length > 30) return "USER_WIN";
  return "PARTIAL";
}

/** Case 2：messages 里塞了 assistant 历史。提到北京 = 记得。 */
export function judgeCase2(text: string): Verdict {
  return text.includes("北京") ? "REMEMBERED" : "FORGOT";
}

/**
 * Case 3：漏塞 assistant。承认不知道 / 反问 = 失忆；
 * 提到北京往往只是读到了相邻的 user 句，不是真正「多轮记得」→ PARTIAL。
 */
export function judgeCase3(text: string): Verdict {
  if (
    text.includes("不知道") ||
    text.includes("没说") ||
    text.includes("您没") ||
    text.includes("请告诉") ||
    text.includes("没有提") ||
    text.includes("没提")
  ) {
    return "FORGOT";
  }
  if (text.includes("北京")) return "PARTIAL";
  return "FORGOT";
}
