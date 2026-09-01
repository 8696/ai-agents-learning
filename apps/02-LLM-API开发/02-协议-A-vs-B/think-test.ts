/**
 * 实验：MiniMax-M3 在协议 B 端点传 `thinking` 参数会怎样？
 *
 * 4 组对照（同 prompt：'23 × 47 等于多少？先一步步想，再回答。'）：
 *   A0  协议 A 流式（不带 thinking）         → 看 <think> 标记 + reasoning_tokens
 *   B0  协议 B 流式（不带 thinking）         → 现状：直接答案 + 无 reasoning_tokens
 *   B1  协议 B 流式（带 thinking 100 token）  → 看是否被接受 / 出 type=thinking block / 改变 output_tokens
 *   B2  协议 B 流式（带 thinking 500 token）  → 看 budget 增大是否生效
 */
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { loadRootEnv } from "../../load-root-env.js";

loadRootEnv();

const apiKey = process.env.MINIMAX_API_KEY!;
const baseURL_A = process.env.MINIMAX_BASE_URL ?? "https://api.minimaxi.com/v1";
const baseURL_B = process.env.MINIMAX_ANTHROPIC_BASE_URL ?? "https://api.minimaxi.com/anthropic";
const model = process.env.MINIMAX_MODEL ?? "MiniMax-M3";
const modelB = process.env.MINIMAX_ANTHROPIC_MODEL ?? "MiniMax-M3";
const prompt = "23 × 47 等于多少？先一步步想，再回答。";

const a = new OpenAI({ apiKey, baseURL: baseURL_A });
const b = new Anthropic({ apiKey, baseURL: baseURL_B });

// ── 1) A 流式（不带 thinking） ──
async function runA0() {
  console.log("\n========== A0 · 协议 A 流式（不带 thinking） ==========");
  const stream = await a.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    stream: true,
    stream_options: { include_usage: true },
  });
  let acc = "";
  for await (const chunk of stream) {
    const d = chunk.choices?.[0]?.delta?.content;
    if (d) acc += d;
  }
  console.log("完整 content:", JSON.stringify(acc));
  console.log("是否含 <think>:", /<think>/.test(acc));
  console.log("含 <think> 时提取:", acc.match(/<think>[\s\S]*?<\/think>/)?.[0]?.slice(0, 300));
  return acc;
}

// ── 2/3/4) B 流式（不带 / 带 thinking 100 / 带 thinking 500） ──
async function runB(label: string, opts: { thinking?: { type: "enabled"; budget_tokens: number } }) {
  console.log(`\n========== ${label} · 协议 B 流式${opts.thinking ? `（带 thinking budget=${opts.thinking.budget_tokens}）` : "（不带 thinking）"} ==========`);

  // 收集所有事件类型 + 文本
  const eventTypes: string[] = [];
  let thinkingText = "";
  let answerText = "";
  let usage: unknown = null;
  let stopReason: string | null = null;

  try {
    const stream = b.messages.stream({
      model: modelB,
      max_tokens: 2048, // thinking 启用时这个得 ≥ budget_tokens
      messages: [{ role: "user", content: prompt }],
      ...(opts.thinking ? { thinking: opts.thinking } : {}),
    });

    // @ts-ignore
    stream.on("event", (evt: { type: string }) => {
      eventTypes.push(evt.type);
    });
    stream.on("text", (t: string) => {
      answerText += t;
    });

    const final = await stream.finalMessage();
    usage = final.usage;
    stopReason = final.stop_reason;
    // final.content 数组里找 thinking block
    for (const block of final.content) {
      if (block.type === "thinking") {
        thinkingText += (block as { thinking: string }).thinking;
      }
    }
  } catch (err: unknown) {
    console.log(`✗ ${label} 请求失败:`, err instanceof Error ? err.message : String(err));
    return null;
  }

  console.log("事件类型序列（去重计数）:", summarize(eventTypes));
  console.log("stop_reason:", stopReason);
  console.log("usage:", usage);
  console.log("answerText:", JSON.stringify(answerText));
  console.log("thinkingText:", JSON.stringify(thinkingText));

  return { usage, stopReason, answerText, thinkingText, eventTypes };
}

function summarize(arr: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of arr) out[x] = (out[x] ?? 0) + 1;
  return out;
}

(async () => {
  const a0 = await runA0();
  const b0 = await runB("B0", {});
  const b1 = await runB("B1", { thinking: { type: "enabled", budget_tokens: 100 } });
  const b2 = await runB("B2", { thinking: { type: "enabled", budget_tokens: 500 } });

  console.log("\n\n========== 对照表 ==========");
  console.log("| 组 | 端点 | thinking 参数 | 文本长度(answer) | 是否有 thinking block | reasoning_tokens |");
  console.log("| -- | ---- | -------------- | ---------------- | --------------------- | ---------------- |");
  const aText = a0?.replace(/<think>[\s\S]*?<\/think>/g, "") ?? "";
  console.log(`| A0 | /v1 | 不带           | ${aText.length}              | 否（嵌在 content 字符串里）| ${JSON.stringify(a0).match(/<think>([\s\S]*?)<\/think>/)?.[1]?.length ?? 0} 字符嵌思考 |`);
  console.log(`| B0 | /anthropic | 不带      | ${b0?.answerText.length ?? "—"}              | ${b0 && b0.thinkingText ? "是" : "否"}                    | ${(b0?.usage && "reasoning_tokens" in (b0.usage as Record<string, unknown>)) ? "有" : "无字段"} |`);
  console.log(`| B1 | /anthropic | budget=100 | ${b1?.answerText.length ?? "—"}              | ${b1 && b1.thinkingText ? "是" : "否"}                    | ${(b1?.usage && "reasoning_tokens" in (b1.usage as Record<string, unknown>)) ? "有" : "无字段"} |`);
  console.log(`| B2 | /anthropic | budget=500 | ${b2?.answerText.length ?? "—"}              | ${b2 && b2.thinkingText ? "是" : "否"}                    | ${(b2?.usage && "reasoning_tokens" in (b2.usage as Record<string, unknown>)) ? "有" : "无字段"} |`);
})();
