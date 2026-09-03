/**
 * 职责：把模型嘴边的原文变成「下游能不能 parse」的判定。
 * 数据流：raw → 剥思考块 → JSON.parse + VerdictSchema → { stripped, hadThinking, formatValid, parsed }。
 * 为什么单独成文件：剥思考是网关职责，不是 Prompt 对照本身；和拼 messages 拆开，改剥法不会碰到教案。
 */
import { VerdictSchema } from "./presets.js";

/**
 * 思考块是模型行为，不是 JSON 的一部分。
 * 网关先剥再 parse；不剥的话 JSON.parse 会撞上 '<think>' 的 '<'。
 * 未闭合的 think 则从第一个 { 起截（后面才是业务 JSON）。
 */
export function stripThinking(raw: string): { body: string; hadThinking: boolean } {
  const paired = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
  const withoutPairs = raw.replace(paired, "");
  const hadPaired = withoutPairs !== raw;
  let body = withoutPairs;
  const leftoverOpen = /<think\b[^>]*>/i.exec(body);
  if (leftoverOpen) {
    const brace = body.indexOf("{", leftoverOpen.index);
    body =
      brace >= 0
        ? body.slice(brace)
        : body.replace(/<think\b[^>]*>[\s\S]*/gi, "");
  }
  return {
    body: body.trim(),
    hadThinking: hadPaired || /<think\b/i.test(raw),
  };
}

export function judgeFormat(raw: string): {
  stripped: string;
  hadThinking: boolean;
  formatValid: boolean;
  parsed: ReturnType<typeof VerdictSchema.parse> | null;
  formatError: string | null;
} {
  const { body, hadThinking } = stripThinking(raw);
  try {
    const parsed = VerdictSchema.parse(JSON.parse(body));
    return {
      stripped: body,
      hadThinking,
      formatValid: true,
      parsed,
      formatError: null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stripped: body,
      hadThinking,
      formatValid: false,
      parsed: null,
      formatError: message,
    };
  }
}
