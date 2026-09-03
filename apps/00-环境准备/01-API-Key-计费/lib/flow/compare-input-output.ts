/**
 * 职责：跑「长输入·短输出」与「短输入·长输出」两次调用，把两张账单并排摆出来。
 * 数据流：固定两组 preset → measureOneCall ×2（顺序执行）→ { cases, verdict }。
 * 为什么单独成文件：preset 文案 + 结论算法只服务对照这一个场景，
 *   混进 measure-one-call.ts 会让「量一次」这件事看起来很复杂。
 */
import type { Llm } from "../../../../llm.js";
import { measureOneCall, logMeasurement } from "./measure-one-call.js";
import type { BillingMeasurement } from "./measure-types.js";

// 一段够长的输入，用来把 prompt_tokens 顶上去；内容本身不重要，重要的是它很长。
const LONG_INPUT = [
  "下面是一段会议纪要，请你读完后只回复一个字：好。",
  "本周前端组完成了登录页改版，接口联调通过；测试环境部署两次，回滚一次，原因是静态资源缓存未失效。",
  "下周计划：拆分构建产物、接入错误上报、把首页首屏时间从 2.1 秒压到 1.5 秒以内。",
  "风险：设计稿仍有两处交互未定；上游服务在高峰期偶发超时，需要确认重试策略。",
  "另外，运营希望在活动期间加一个浮层，产品同学还在评估对转化的影响，暂不排期。",
].join("");

/** 两个 case 只差「长的那一段落在输入侧还是输出侧」，其余条件尽量一致。 */
const CASES = [
  {
    label: "① 长输入 · 短输出",
    prompt: LONG_INPUT,
    maxTokens: 16,
    expect: "期望：prompt_tokens 很大、completion_tokens 个位数，钱主要花在输入侧。",
  },
  {
    label: "② 短输入 · 长输出",
    prompt: "用大约 150 字介绍 HTTP 缓存的作用，直接给正文。",
    maxTokens: 256,
    expect: "期望：prompt_tokens 很小、completion_tokens 上百，钱主要花在输出侧（单价更贵）。",
  },
] as const;

export type CompareCase = BillingMeasurement & { expect: string };

export type CompareResult = {
  cases: CompareCase[];
  verdict: {
    /** 哪个 case 的 total_tokens 更多 */
    moreTokensLabel: string;
    /** 哪个 case 花的钱更多 */
    moreCostLabel: string;
    /** 更贵的那次 ÷ 更便宜的那次，看倍数比看绝对值更直观 */
    costRatio: number;
    text: string;
  };
};

/**
 * 顺序跑两次。
 * ① 故意不用 Promise.all：本条是模块 00，很多人的 Key 刚开通就有并发限制，
 *    并行更容易撞 429，而这里并行也换不来任何教学信息；
 * ② 两次都跑完才算结果——只跑成功一次就下结论，等于没有对照。
 */
export async function compareInputVsOutput(llm: Llm): Promise<CompareResult> {
  const measured: CompareCase[] = [];
  for (const preset of CASES) {
    const m = await measureOneCall({
      llm,
      label: preset.label,
      prompt: preset.prompt,
      maxTokens: preset.maxTokens,
    });
    logMeasurement("/api/billing-compare", m);
    measured.push({ ...m, expect: preset.expect });
  }
  return { cases: measured, verdict: buildVerdict(measured) };
}

/**
 * 算结论：Token 多的那次，未必是花钱多的那次。
 * 这正是本条要看见的现象——总量相同的两次调用，输出占比高的那次账单更大。
 */
function buildVerdict(cases: CompareCase[]): CompareResult["verdict"] {
  const [a, b] = cases;
  if (!a || !b) {
    return { moreTokensLabel: "-", moreCostLabel: "-", costRatio: 1, text: "对照需要两次结果。" };
  }
  const moreTokens = a.usage.total_tokens >= b.usage.total_tokens ? a : b;
  const moreCost = a.cost.totalCny >= b.cost.totalCny ? a : b;
  const cheaper = moreCost === a ? b : a;
  const costRatio =
    cheaper.cost.totalCny === 0
      ? 0
      : Math.round((moreCost.cost.totalCny / cheaper.cost.totalCny) * 100) / 100;

  const sameWinner = moreTokens.label === moreCost.label;
  return {
    moreTokensLabel: moreTokens.label,
    moreCostLabel: moreCost.label,
    costRatio,
    text: sameWinner
      ? `${moreCost.label} 既是 Token 更多的一次，也是更贵的一次（约 ${costRatio} 倍）。看输出占比：${moreCost.cost.outputSharePercent}% 的钱花在 completion_tokens 上。`
      : `注意：Token 更多的是 ${moreTokens.label}，但更贵的是 ${moreCost.label}（约 ${costRatio} 倍）——因为输出单价更高，Token 总量不能直接当账单看。`,
  };
}
