/**
 * 模块 03 本地产出 CLI · 跑 8 个 Prompt × 5 样本 = 40 次 MiniMax 协议 A 调用
 *
 * 用法：
 * 可选 CLI：cd apps && yarn app:03-05-local-products
 * 本行过关看 HTTP 工作台：yarn app:03-05-prompt-lab（50305）
 *
 * 设计：
 *  - temperature=0 + max_tokens=200，最大程度减少随机性
 *  - 每 Prompt 5 样本并行（共 8×5=40 次并发）
 *  - 每条样本验证：
 *      · 若设了 expectContains：输出 raw 大小写不敏感子串命中即过
 *      · 否则：非空即过
 *  - 终端打印每条 Prompt 期望 × 实际 + 整组通过率 + 平均延时
 *
 * 与模块 03 · 04 节「Prompt 版本管理」学到的做法对齐：
 *  - 每个 Prompt 都有 version / date / changelog / model
 *  - 每个 Prompt 至少 5 样本
 *  - 跑同一组样本比对两版差异（这次没有 v1/v2 同时跑；是 v1.0.0 单版回归）
 */
import { getLlm, logLlmConfig } from "../../../llm.js";
import {
  PROMPTS,
  buildMessages,
  type PromptTemplate,
  type Sample,
} from "./prompts.js";

const llm = getLlm();
const openai = llm.openai;

type SampleResult = {
  index: number;
  sample: Sample;
  ok: boolean;
  detail: string;
  output: string;
  latencyMs: number;
};

async function callOne(
  prompt: PromptTemplate,
  sample: Sample,
  index: number,
): Promise<SampleResult> {
  const t0 = Date.now();
  try {
    const completion = await openai.chat.completions.create({
      model: llm.modelA,
      temperature: 0,
      max_tokens: 200,
      messages: buildMessages(
        { system: prompt.system, userTemplate: prompt.userTemplate },
        sample.vars,
      ),
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const trimmed = raw.trim();
    const expectation = sample.expectContains;
    let ok = false;
    let detail = "";
    if (expectation !== undefined) {
      ok = raw.toLowerCase().includes(expectation.toLowerCase());
      if (!ok) {
        detail = `输出未包含期望子串「${expectation}」`;
      }
    } else {
      ok = trimmed.length > 0;
      if (!ok) {
        detail = "输出为空";
      }
    }
    return {
      index,
      sample,
      ok,
      detail,
      output: trimmed,
      latencyMs: Date.now() - t0,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      index,
      sample,
      ok: false,
      detail: `调用失败：${message}`,
      output: "(失败)",
      latencyMs: Date.now() - t0,
    };
  }
}

async function main(): Promise<void> {
  console.log("模块 03 本地产出 · Prompt 回归（8 Prompt × 5 样本）");
  console.log("─────────────────────────────────────────");
  logLlmConfig(llm);
  console.log("─────────────────────────────────────────");

  let totalAll = 0;
  let totalPass = 0;
  let totalLatency = 0;

  for (const prompt of PROMPTS) {
    console.log(
      `\n▶ ${prompt.id} (${prompt.version}) — ${prompt.name}`,
    );
    console.log(`  模型: ${prompt.model} · ${prompt.samples.length} 样本 · ${prompt.changelog}`);
    const results = await Promise.all(
      prompt.samples.map((s, i) => callOne(prompt, s, i + 1)),
    );
    for (const r of results) {
      const mark = r.ok ? "✓" : "✗";
      const expect = r.sample.expectContains
        ? ` [expect: "${r.sample.expectContains}"]`
        : "";
      const note = r.sample.note ? ` · ${r.sample.note}` : "";
      const detail = r.detail ? ` (${r.detail})` : "";
      console.log(`  ${mark} #${r.index}${expect}${note}${detail} · ${r.latencyMs}ms`);
      if (!r.ok) {
        const inputPreview = JSON.stringify(r.sample.vars).slice(0, 100);
        console.log(`      输入: ${inputPreview}`);
        console.log(`      输出: ${r.output.slice(0, 120)}`);
      }
    }
    const passed = results.filter((r) => r.ok).length;
    totalAll += results.length;
    totalPass += passed;
    totalLatency += results.reduce((a, b) => a + b.latencyMs, 0);
    const ratio = (passed / results.length) * 100;
    console.log(`  → ${passed}/${results.length} 通过 (${ratio.toFixed(0)}%)`);
  }

  console.log("\n─────────────────────────────────────────");
  const ratioAll = totalAll > 0 ? (totalPass / totalAll) * 100 : 0;
  const avgMs = totalAll > 0 ? Math.round(totalLatency / totalAll) : 0;
  console.log(
    `汇总: ${totalPass}/${totalAll} 通过 (${ratioAll.toFixed(1)}%) · 平均延时 ${avgMs}ms`,
  );
}

main().catch((error: unknown) => {
  console.error("\n本地产出运行失败:", error);
  process.exit(1);
});
