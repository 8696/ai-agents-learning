/**
 * 职责：prompt 强引导模型填 enum 外的 action，看守约——不是测 API 400。
 * 数据流：INDUCE_UNKNOWN_PROMPT → 强制 tool_choice → Zod。violated = Zod 没过。
 * 为什么单独成文件：协议 B 不像协议 A 在 API 入口拒坏 schema。
 *   这一刀测的是模型守约能力；和协议 A 的 strict-rejected 测的不是一回事。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { INDUCE_UNKNOWN_PROMPT } from "../schema/intent.js";
import type { ModeCallResult } from "./measure-types.js";
import { runToolUseForced } from "./run-tool-use.js";

export type ToolRejectedResult = ModeCallResult & {
  violated: boolean;
};

export async function runToolRejected(llm: Llm): Promise<ToolRejectedResult> {
  const t0 = performance.now();
  const out = await runToolUseForced(llm, INDUCE_UNKNOWN_PROMPT);
  return {
    ...out,
    elapsedMs: Math.round(performance.now() - t0),
    // Zod 没过 = 模型没守 enum / 缺字段。协议 B 不会因此 400。
    violated: !out.parseOk,
  };
}
