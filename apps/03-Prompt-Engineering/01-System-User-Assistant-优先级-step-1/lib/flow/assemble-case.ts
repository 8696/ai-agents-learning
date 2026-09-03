/**
 * 职责：把两侧 PromiseSettledResult 收成 CaseResponse（判定、剥思考、失败占位）。
 * 数据流：CallResult | 拒绝原因 → SideResult → { a, b }。本文件不调 SDK。
 */
import { stripThink, VERDICT_LABEL } from "./judge.js";
import type {
  CallResult,
  CaseResponse,
  CaseSpec,
  SideResult,
  Verdict,
} from "./types.js";

function toSide(
  protocol: "A" | "B",
  cr: CallResult,
  judge: (text: string) => Verdict,
): SideResult {
  const verdict = judge(cr.text);
  return {
    protocol,
    text: cr.text,
    cleanedText: stripThink(cr.text),
    usage: cr.usage,
    durationMs: cr.durationMs,
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
  };
}

function sideFromSettled(
  protocol: "A" | "B",
  settled: PromiseSettledResult<CallResult>,
  judge: (text: string) => Verdict,
  failVerdict: Verdict,
): SideResult {
  if (settled.status === "fulfilled") return toSide(protocol, settled.value, judge);
  return {
    protocol,
    text: "",
    cleanedText: "",
    usage: { input: 0, output: 0 },
    durationMs: 0,
    verdict: failVerdict,
    verdictLabel: "⚠️  请求失败",
    error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
  };
}

/**
 * ① allSettled 而不是 all：一侧上游炸了，另一侧结果仍要给页面对照。
 * ② failVerdict 跟 case 走（Case 1 用 PARTIAL，2/3 用 FORGOT），与旧端点一致。
 */
export function buildCaseResponse(
  spec: CaseSpec,
  aSettled: PromiseSettledResult<CallResult>,
  bSettled: PromiseSettledResult<CallResult>,
  judge: (text: string) => Verdict,
  failVerdict: Verdict,
): CaseResponse {
  return {
    caseName: spec.caseName,
    system: spec.system,
    user: spec.user,
    turns: spec.turns,
    a: sideFromSettled("A", aSettled, judge, failVerdict),
    b: sideFromSettled("B", bSettled, judge, failVerdict),
  };
}
