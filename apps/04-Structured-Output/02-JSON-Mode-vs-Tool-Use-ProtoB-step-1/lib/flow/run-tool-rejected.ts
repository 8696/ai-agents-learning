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
import { logger } from "../logger.js";

export type ToolRejectedResult = ModeCallResult & {
  violated: boolean;
};

export async function runToolRejected(llm: Llm): Promise<ToolRejectedResult> {
  const t0 = performance.now();

  // 这一行是协议 B「诱导守约」测试的入口标记 —— 不是 LLM 调用本身。
  // 真正的 LLM 调用在下面的 runToolUseForced 里（scope=llm.request.toolUse），
  // 这一刀主要观察 input_schema / enum 在「prompt 故意诱导填 enum 外 action」时的守约能力。
  logger.info(
    "llm.request.toolRejected",
    "→ 进入诱导守约路径（prompt 故意引导 enum 外字段）",
    "教学点：协议 B 不像协议 A 在 API 入口 400 拒坏 schema。这一刀测的是模型守 input_schema / enum 的能力，prompt 故意让 action 填 'unknown'（enum 外）。下面实际 LLM 调用的 request/response 详细日志由 runToolUseForced（scope=llm.request.toolUse）打。",
    {
      provider: llm.provider,
      model: llm.modelB,
      inducingPrompt: INDUCE_UNKNOWN_PROMPT,
      probeField: "action",
      probeInduceValue: "unknown",
      expectedEnum: ["search", "order", "cancel"],
      __code: `const out = await runToolUseForced(llm, INDUCE_UNKNOWN_PROMPT);\n// violated = !out.parseOk  （Zod 没过的语义就是模型没守 enum）`,
    },
  );

  const out = await runToolUseForced(llm, INDUCE_UNKNOWN_PROMPT);

  // Zod 没过 = 模型没守 enum / 缺字段。协议 B 不会因此 400。
  const violated = !out.parseOk;

  logger.info(
    "llm.response.toolRejected",
    "← 守约结果（解析是否过 + violated 标记）",
    "汇总：violated = !parseOk。Zod 没过 = 模型没守 enum / 缺字段（protocolB 不会因此在 API 入口 400，所以这一步是测守约能力）。同时打 raw 字符串便于人眼对照模型实际返回了什么。",
    {
      provider: llm.provider,
      model: llm.modelB,
      parseOk: out.parseOk,
      violated,
      parseError: out.parseError,
      toolUsed: out.toolUse?.name ?? null,
      raw: out.raw,
      analysis: out.analysis,
      elapsedMs: out.elapsedMs,
    },
  );

  return {
    ...out,
    elapsedMs: Math.round(performance.now() - t0),
    violated,
  };
}
