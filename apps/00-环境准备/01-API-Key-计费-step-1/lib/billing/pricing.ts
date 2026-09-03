/**
 * 职责：把 usage 的 Token 数折算成钱 —— 本条教学点「输入 / 输出分开计价」的算钱那一半。
 * 数据流：{ prompt_tokens, completion_tokens } + 示例单价 → { inputCny, outputCny, totalCny }，
 *   随响应回给页面，并由 GET /health 暴露单价，页面不自己写死数字。
 * 为什么单独成文件：单价是「会变的外部事实」，而 flow/ 是「不会变的调用流程」。
 *   换提供商只该改这里一处，不该翻 route 和 HTML。
 */

/**
 * 示例单价（元 / 百万 Token）。
 * 故意不写某一家某个模型的真实报价：本仓库的提供商随 apps/.env 的 LLM_PROVIDER 换，
 * 写死会立刻过期，而且会让人误以为账单可以在页面上算准。
 * 这里只保留一个事实：**输出比输入贵**（多数家 3~5 倍），下面用 4 倍。
 * 真实账单永远以提供商控制台为准。
 */
export const PRICING = {
  currency: "CNY",
  inputPerMillion: 1.0,
  outputPerMillion: 4.0,
  note: "示例单价（元/百万 Token），仅用于演示「输入便宜、输出贵」；真实费用以提供商控制台账单为准。",
} as const;

export type CostBreakdown = {
  currency: string;
  /** 输入部分的钱：prompt_tokens × 输入单价 */
  inputCny: number;
  /** 输出部分的钱：completion_tokens × 输出单价 */
  outputCny: number;
  totalCny: number;
  /** 输出这一段占总花费的百分比，用来直观看出「回复长比问题长更烧钱」 */
  outputSharePercent: number;
  inputPerMillion: number;
  outputPerMillion: number;
  note: string;
};

// 单位是「元/百万 Token」，所以要除以 1e6；保留 6 位小数，避免几十个 Token 时显示成 0。
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * 分项折价。
 * ① 输入、输出各乘各的单价——这就是「为什么账单要分两栏」的全部原因；
 * ② 再算输出占比：同样 100 个 Token，落在输出侧的花费是落在输入侧的 4 倍，
 *    占比这一个数字比两行金额更容易让人记住。
 */
export function computeCost(promptTokens: number, completionTokens: number): CostBreakdown {
  const inputCny = round6((promptTokens * PRICING.inputPerMillion) / 1_000_000);
  const outputCny = round6((completionTokens * PRICING.outputPerMillion) / 1_000_000);
  const totalCny = round6(inputCny + outputCny);
  const outputSharePercent = totalCny === 0 ? 0 : Math.round((outputCny / totalCny) * 100);

  return {
    currency: PRICING.currency,
    inputCny,
    outputCny,
    totalCny,
    outputSharePercent,
    inputPerMillion: PRICING.inputPerMillion,
    outputPerMillion: PRICING.outputPerMillion,
    note: PRICING.note,
  };
}
