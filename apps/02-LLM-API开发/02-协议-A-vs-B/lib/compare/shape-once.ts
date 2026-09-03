/**
 * 职责：把两侧 PromiseSettled 翻成并排 JSON（协议无关，不调 SDK）。
 * 数据流：{ aSettled, bSettled } → { a, b }；失败侧只留 error 字符串。
 */
import type { ComparePair } from "./types.js";

function settledValue(r: PromiseSettledResult<unknown>): unknown {
  if (r.status === "fulfilled") return r.value;
  const reason = r.reason;
  return { error: reason instanceof Error ? reason.message : String(reason) };
}

/** ① 先 allSettled 再进来：一侧挂了另一侧仍能对照。顺序不能换成 Promise.all。 */
export function shapeComparePair(
  aSettled: PromiseSettledResult<unknown>,
  bSettled: PromiseSettledResult<unknown>,
): ComparePair {
  return { a: settledValue(aSettled), b: settledValue(bSettled) };
}

/** think-compare 四张卡的固定顺序：A 关 / A 开 / B 关 / B 开。 */
export function shapeThinkScenarios<T>(aOff: T, aOn: T, bOff: T, bOn: T): { scenarios: T[] } {
  return { scenarios: [aOff, aOn, bOff, bOn] };
}
