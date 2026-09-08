/**
 * 职责：prompt 强引导模型填 enum 外的 action，看守约——不是测 API 400。
 * 数据流：INDUCE_UNKNOWN_PROMPT → 强制 tool_choice → Zod。violated = Zod 没过。
 * 为什么单独成文件：协议 B 不像协议 A 在 API 入口拒坏 schema。
 *   这一刀测的是模型守约能力；和协议 A 的 strict-rejected 测的不是一回事。
 *
 * 日志（§5.3.16）：调用函数 五件套（runToolRejected 编排层），子调用 runToolUseForced 内部已自带五件套。
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
  const tFuncStart = Date.now();

  // 这一行是协议 B「诱导守约」测试的入口标记 —— 不是 LLM 调用本身。
  // 真正的 LLM 调用在下面的 runToolUseForced 里（scope=llm.request.toolUse），
  // 这一刀主要观察 input_schema / enum 在「prompt 故意诱导填 enum 外 action」时的守约能力。
  logger.info(
    "│ 诱导守约-runToolRejected",
    "调用函数开始：runToolRejected",
    "为什么打：route 只认这一层返回的 ToolRejectedResult；里面 runToolUseForced 是「真活」。当前：教学点——协议 B 不像协议 A 在 API 入口 400 拒坏 schema，这一刀测的是模型守 input_schema / enum 的能力。",
    {
      入参: { model: llm.modelB, inducingPrompt: INDUCE_UNKNOWN_PROMPT, probeField: "action", probeInduceValue: "unknown", expectedEnum: ["search", "order", "cancel"] },
      __code: `const out = await runToolUseForced(llm, INDUCE_UNKNOWN_PROMPT);\n// violated = !out.parseOk  （Zod 没过的语义就是模型没守 enum）`,
    },
  );

  const out = await runToolUseForced(llm, INDUCE_UNKNOWN_PROMPT);

  // Zod 没过 = 模型没守 enum / 缺字段。协议 B 不会因此 400。
  const violated = !out.parseOk;

  logger.info(
    "│ 诱导守约-runToolRejected",
    "调用函数结束：runToolRejected",
    "为什么打：route 要把 ToolRejectedResult 写进 ctx.body 交给页面 stats 区；记 violated + parseOk 便于核对「prompt 故意诱导下模型守不守 enum」。",
    {
      返回值: {
        parseOk: out.parseOk,
        violated,
        parseError: out.parseError,
        toolUsed: out.toolUse?.name ?? null,
        raw: out.raw,
        analysis: out.analysis,
        elapsedMs: out.elapsedMs,
      },
      耗时ms: Date.now() - tFuncStart,
      字段释义: {
        violated: "true = Zod 没过 → 模型没守 enum / 缺字段；false = 模型守约",
      },
    },
  );
  return {
    ...out,
    elapsedMs: Math.round(performance.now() - t0),
    violated,
  };
}