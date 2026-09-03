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
  console.log("");
  console.log(
    "═════════════════════════════════════════════════════════════════════════════════",
  );
  console.log(
    ` runToolLoop 开始  provider=${opts.llm.provider}  model=${opts.llm.modelA}  maxRounds=${opts.maxRounds}`,
  );
  console.log(
    "═════════════════════════════════════════════════════════════════════════════════",
  );
  console.log("   每轮结构: 发 1 次模型  → 拿到 N 个 tool_call");
  console.log("                  ↓");
  console.log("             N > 0 → 并行执行 N 个 tool（Promise.all）→ tool_result 回灌 messages");
  console.log("             N = 0 或 finish_reason=stop → 退出循环");
  console.log(
    "─────────────────────────────────────────────────────────────────────────────────",
  );

  // messages 是这一圈里唯一累积的东西：每轮把「模型说了什么」+「工具返回什么」都追加进去，
  // 模型才有上下文接着往下走。它不是聊天记录的装饰，是循环能成立的前提。
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.prompt },
  ];
  const rounds: RoundOut[] = [];
  let lastContent = "";
  let stopReason = "";
  // 上一轮 tool_call 名字，轮开始时打出来告诉「"依赖上轮的什么"」
  let prevToolNames: string[] = [];

  // maxRounds 是安全阀：模型可能一直要求调工具，没有上限就会无限往返
  for (let round = 1; round <= opts.maxRounds; round++) {
    const rT0 = performance.now();

    // ── 轮开始横幅 ──
    console.log("");
    if (round === 1) {
      console.log(
        `▶▶▶ [轮 ${round}]  起点 · messages=${messages.length} 条 · 仅 system + user  ──── 串行 ────`,
      );
      console.log("                ↑ 上轮结果：无（这是第一次发模型）");
    } else {
      console.log(
        `▶▶▶ [轮 ${round}]  messages=${messages.length} 条  ──── 串行（依赖上轮结果）────`,
      );
      console.log(
        `                ↑ 上轮结果：${prevToolNames.join(" / ")} 的 tool_result 已回灌 messages`,
      );
    }
    console.log(
      "─────────────────────────────────────────────────────────────────────────────────",
    );

    // ① 发一轮：每轮都要重新带上 tools，模型不会记得上一轮给过什么工具
    const tools = buildOpenAITools();
    console.log(`  ▼ 发模型（POST chat.completions.create）`);
    console.log(`     model=${opts.llm.modelA}`);
    console.log(`     messages.length=${messages.length}  ·  tools.length=${tools.length}`);
    // 打 messages + tools 全量；过长截前 2500 字，长度超出打「…(截)」提示自己往下找
    const reqPayload = JSON.stringify({ messages: messages, tools: tools });
    const reqShown =
      reqPayload.length > 2500 ? reqPayload.slice(0, 2500) + "…(截)" : reqPayload;
    console.log(`     payload=${reqShown}`);
    const r = await opts.llm.openai.chat.completions.create({
      model: opts.llm.modelA,
      messages,
      tools: buildOpenAITools(),
    });
    const m = r.choices[0]?.message;
    const fr = r.choices[0]?.finish_reason ?? null;
    const tcs = (m?.tool_calls ?? []) as ChatCompletionMessageToolCall[];
    const rElapsed = Math.round(performance.now() - rT0);

    // 打完整 r.choices[0] JSON（含 message.tool_calls 完整结构 + reasoning_content）
    const respPayload = JSON.stringify(r.choices[0]);
    const respShown =
      respPayload.length > 2000 ? respPayload.slice(0, 2000) + "…(截)" : respPayload;
    console.log(`  ▲ 模型返回 · 耗时 ${rElapsed}ms`);
    console.log(`     finish_reason=${fr ?? "null"}  ·  tool_calls=${tcs.length} 个`);
    console.log(`     choices[0]=${respShown}`);
    if (m?.content) {
      console.log(`     content=${m.content.slice(0, 200).replace(/\n/g, " ")}${m.content.length > 200 ? "…" : ""}`);
    }
    tcs.forEach(function (tc, i) {
      console.log(`     [tc_${i + 1}] ${tc.function.name}  args=${tc.function.arguments}`);
    });

    // ② 终止判断放在执行之前：这一轮若已是终态，就不该再执行任何工具
    if (shouldStop(tcs, fr)) {
      stopReason =
        tcs.length === 0
          ? "no_tool_calls"
          : fr === "stop"
            ? "stop"
            : fr === "length"
              ? "length"
              : fr === "content_filter"
                ? "content_filter"
                : `finish_reason=${fr}`;
      console.log("");
      console.log(
        `◀◀◀ [轮 ${round} 终止]  原因=${stopReason}  · 耗时 ${rElapsed}ms`,
      );
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
    console.log("");
    console.log(
      `  ⇉⇉⇉ 并行执行 ${tcs.length} 个 tool_call（Promise.all）`,
    );
    const execResults = await executeToolCalls(tcs);
    console.log("");
    console.log(
      `▶▶▶ [轮 ${round} 完成]  耗时 ${Math.round(performance.now() - rT0)}ms  ·  messages → ${messages.length + 1 + execResults.length} 条（+1 assistant + ${execResults.length} tool_result）`,
    );
    rounds.push({
      round,
      finish_reason: fr,
      content: m?.content ?? null,
      tool_calls: slimToolCalls(tcs),
      toolResults: execResults,
    });
    lastContent = m?.content ?? "";

    // 记录这一轮的 tool_call 名字，下一轮开始时打「依赖上轮什么」
    prevToolNames = tcs.map(function (tc) { return tc.function.name; });

    // ④ 回灌：assistant 消息必须先于 tool 结果入队，且顺序不能乱 ——
    //    协议要求每个 tool_call_id 都能在前面找到对应的 assistant.tool_calls，否则上游报 400
    messages.push(m as ChatCompletionMessageParam, ...toolResultsToMessages(execResults));
  }

  // 如果打满 maxRounds 都没 break，停在这里打「安全阀兜底」
  if (!stopReason) {
    stopReason = `maxRounds=${opts.maxRounds}_reached`;
    console.log("");
    console.log(`◀◀◀ [安全阀兜底]  跑满 maxRounds=${opts.maxRounds} 仍无 stop`);
  }

  const totalMs = Math.round(performance.now() - t0);
  console.log("");
  console.log(
    "═════════════════════════════════════════════════════════════════════════════════",
  );
  console.log(
    ` runToolLoop 退出  totalRounds=${rounds.length}  reason=${stopReason}  累计 ${totalMs}ms`,
  );
  console.log(
    "═════════════════════════════════════════════════════════════════════════════════",
  );
  console.log("");

  return {
    rounds,
    finalContent: lastContent,
    totalRounds: rounds.length,
    elapsedMs: totalMs,
  };
}
