/**
 * 职责：Zod repair 教学闭环（服务端篡改合法 tool_call → Zod ✗ → 回灌 → 模型改对）。
 * 数据流：固定 prompt「5+3」→ Round1 tampered → Round2+ 正常执行 → 与其它 API 同形的 rounds。
 * 为什么不走 runToolLoop：第一轮必须人工改 arguments，这是本场景的唯一点。
 */
import { performance } from "node:perf_hooks";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import type { Llm } from "../../../../llm.js";
import { buildOpenAITools } from "../tools/registry.js";
import { executeToolCalls, toolResultsToMessages } from "./execute-tool-calls.js";
import { slimToolCalls, type RoundOut } from "./round-types.js";

const DEMO_PROMPT = "算一下 5 加 3 等于多少";
const DEMO_SYSTEM = "你可以使用 add 工具计算两数之和。";

/** 把模型给出的合法 call 改成 a:"not_a_number"，逼 Zod 失败。 */
function tamperFirstCall(
  original: ChatCompletionMessageToolCall,
): ChatCompletionMessageToolCall {
  return {
    id: original.id,
    type: "function",
    function: {
      name: original.function.name,
      arguments: JSON.stringify({ a: "not_a_number", b: 3 }),
    },
  };
}

function isTerminalFinish(fr: string | null): boolean {
  return fr === "stop" || fr === "length" || fr === "content_filter";
}

export async function simulateZodRepair(llm: Llm): Promise<{
  mode: "simulate-zod-error";
  rounds: RoundOut[];
  finalContent: string;
  totalRounds: number;
  elapsedMs: number;
  error?: string;
}> {
  const t0 = performance.now();
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: DEMO_SYSTEM },
    { role: "user", content: DEMO_PROMPT },
  ];

  // Round 1：先让模型正常发一个合法 tool_call，我们再动手改坏它。
  // 为什么不直接编一个假 tool_call：id 必须是模型真实给出的，否则回灌时上游会拒。
  const r1 = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages,
    tools: buildOpenAITools(),
  });
  const m1 = r1.choices[0]?.message;
  const tcs1 = (m1?.tool_calls ?? []) as ChatCompletionMessageToolCall[];
  if (tcs1.length === 0) {
    return {
      mode: "simulate-zod-error",
      rounds: [],
      finalContent: "",
      totalRounds: 0,
      elapsedMs: Math.round(performance.now() - t0),
      error: "模型没调工具，没法演示（试试别的 prompt）",
    };
  }

  const tamperedCall = tamperFirstCall(tcs1[0]);
  // 走正常执行路径：Zod 会拦下，handler 一次都不会被调用
  const r1Results = await executeToolCalls([tamperedCall]);

  // 回灌时 assistant 消息里必须写「篡改后的」call，不能写原始那个 ——
  // 模型要看到自己「发出过」的坏参数，才知道该改什么
  messages.push(
    {
      role: "assistant",
      content: m1.content ?? "",
      tool_calls: [tamperedCall],
    },
    ...toolResultsToMessages(r1Results),
  );

  // Round 2：模型看到 Zod 错误，应重新给合法参数
  const r2 = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages,
    tools: buildOpenAITools(),
  });
  const m2 = r2.choices[0]?.message;
  const tcs2 = (m2?.tool_calls ?? []) as ChatCompletionMessageToolCall[];
  const fr2 = r2.choices[0]?.finish_reason ?? null;

  const rounds: RoundOut[] = [
    {
      round: 1,
      finish_reason: r1.choices[0]?.finish_reason ?? null,
      content: m1?.content ?? null,
      tool_calls: slimToolCalls([tamperedCall]),
      toolResults: r1Results,
      tampered: true,
    },
    {
      round: 2,
      finish_reason: fr2,
      content: m2?.content ?? null,
      tool_calls: slimToolCalls(tcs2),
      toolResults: [],
    },
  ];

  let finalContent = m2?.content ?? "";
  let totalRounds = 2;

  if (tcs2.length > 0 && !isTerminalFinish(fr2)) {
    const r2Results = await executeToolCalls(tcs2);
    rounds.push({
      round: 3,
      finish_reason: fr2,
      content: m2?.content ?? null,
      tool_calls: slimToolCalls(tcs2),
      toolResults: r2Results,
    });
    messages.push(m2 as ChatCompletionMessageParam, ...toolResultsToMessages(r2Results));

    const r3 = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages,
      tools: buildOpenAITools(),
    });
    const m3 = r3.choices[0]?.message;
    rounds.push({
      round: 4,
      finish_reason: r3.choices[0]?.finish_reason ?? null,
      content: m3?.content ?? null,
      tool_calls: slimToolCalls((m3?.tool_calls ?? []) as ChatCompletionMessageToolCall[]),
      toolResults: [],
    });
    finalContent = m3?.content ?? "";
    totalRounds = 4;
  }

  return {
    mode: "simulate-zod-error",
    rounds,
    finalContent,
    totalRounds,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
