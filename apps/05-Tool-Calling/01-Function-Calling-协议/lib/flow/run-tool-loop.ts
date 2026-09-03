/**
 * 职责：主流程「model → tool_calls → execute → 回灌 → 再调 model」循环。
 * 数据流：prompt + maxRounds → rounds[] + finalContent；/api/run 与 /api/run-serial 共用。
 * 终止：无 tool_calls，或 finish_reason 为 stop/length/content_filter，或打满 maxRounds。
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

/**
 * 循环该不该停。
 * 没有 tool_calls = 模型已经在说人话；length / content_filter 是被截断或拦下，
 * 再发一轮也不会更好，同样停 —— 否则会白烧 token 还可能死循环。
 */
function shouldStop(
  tcs: ChatCompletionMessageToolCall[],
  finishReason: string | null,
): boolean {
  return (
    tcs.length === 0 ||
    finishReason === "stop" ||
    finishReason === "length" ||
    finishReason === "content_filter"
  );
}

export async function runToolLoop(opts: {
  llm: Llm;
  prompt: string;
  system: string;
  maxRounds: number;
}): Promise<{
  rounds: RoundOut[];
  finalContent: string;
  totalRounds: number;
  elapsedMs: number;
}> {
  const t0 = performance.now();

  // messages 是这一圈里唯一累积的东西：每轮把「模型说了什么」+「工具返回什么」都追加进去，
  // 模型才有上下文接着往下走。它不是聊天记录的装饰，是循环能成立的前提。
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.prompt },
  ];
  const rounds: RoundOut[] = [];
  let lastContent = "";

  // maxRounds 是安全阀：模型可能一直要求调工具，没有上限就会无限往返
  for (let round = 1; round <= opts.maxRounds; round++) {
    // ① 发一轮：每轮都要重新带上 tools，模型不会记得上一轮给过什么工具
    const r = await opts.llm.openai.chat.completions.create({
      model: opts.llm.modelA,
      messages,
      tools: buildOpenAITools(),
    });
    const m = r.choices[0]?.message;
    const fr = r.choices[0]?.finish_reason ?? null;
    const tcs = (m?.tool_calls ?? []) as ChatCompletionMessageToolCall[];

    // ② 终止判断放在执行之前：这一轮若已是终态，就不该再执行任何工具
    if (shouldStop(tcs, fr)) {
      rounds.push({
        round,
        finish_reason: fr,
        content: m?.content ?? null,
        tool_calls: slimToolCalls(tcs),
        toolResults: [],
      });
      lastContent = m?.content ?? "";
      break;
    }

    // ③ 执行：这一轮的多个 tool_call 之间无依赖，并行跑
    const execResults = await executeToolCalls(tcs);
    rounds.push({
      round,
      finish_reason: fr,
      content: m?.content ?? null,
      tool_calls: slimToolCalls(tcs),
      toolResults: execResults,
    });
    lastContent = m?.content ?? "";

    // ④ 回灌：assistant 消息必须先于 tool 结果入队，且顺序不能乱 ——
    //    协议要求每个 tool_call_id 都能在前面找到对应的 assistant.tool_calls，否则上游报 400
    messages.push(m as ChatCompletionMessageParam, ...toolResultsToMessages(execResults));
  }

  return {
    rounds,
    finalContent: lastContent,
    totalRounds: rounds.length,
    elapsedMs: Math.round(performance.now() - t0),
  };
}
