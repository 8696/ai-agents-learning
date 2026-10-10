/**
 * 本步核心（step-8 · 补 §5.4.B 易混 8 + 踩坑 8 缺口）：演示「知识库节点 vs 真正的 Agent 循环节点」—— 拖一个知识库节点 = 检索那一跳，**不会**自己循环。
 *
 * 职责：
 *   - runKBNode(input)：知识库节点 —— 用 query 调一次 mock KB 检索 → 拿到 top-1 → 输出（**不循环**）
 *   - runAgentNodeWithKB(input)：Agent 循环节点 —— while：调 LLM（mock 决策）→ 模型可能再调 KB → 拿到 top-K → 汇总
 *
 * 数据流：{ query } → 各自处理 → { turns, rounds, finalAnswer }。
 *
 * 为什么单独成文件：route 只做入参校验 + 调这一份；这是和左栏「知识库节点」对照的核心 —— 「它会自己循环查资料」是对「Agent 循环节点」的脑补，不是对「知识库节点」的脑补。
 *
 * 不调大模型（§5.3.0 例外「纯协议形状演示」）：脚本 mock KB 库 + 模拟两栏对照。
 */
import { logger } from "../logger.js";

// ── 类型 ──

export type KBNodeInput = {
  query: string;
};

export type TurnRecord = {
  round: number;
  action: "调知识库" | "调 LLM 汇总";
  result: string;
};

export type KBNodeOutput = {
  query: string;
  /** 跑了多少圈（每一圈 = 一次 KB 检索 或 一次 LLM 汇总） */
  rounds: number;
  /** 给用户的最终一句 */
  finalReply: string;
  /** 这一栏调过 KB 工具 / LLM 的轨迹 */
  turns: TurnRecord[];
  /** 这一栏是否带循环（true = Agent 循环节点；false = 知识库节点） */
  hasLoop: boolean;
  stoppedReason: "natural" | "maxRounds";
};

// ── Mock 知识库（咖啡店场景）──

const MOCK_KB: Array<{ id: string; question: string; answer: string }> = [
  { id: "kb-1", question: "热拿铁能做吗", answer: "热拿铁有库存，可以做。" },
  { id: "kb-2", question: "冰拿铁能做吗", answer: "冰拿铁今日售罄，不能做。" },
  { id: "kb-3", question: "退款流程", answer: "退款 7 天内 + 商品没问题可全额退；质量问题随时退。" },
  { id: "kb-4", question: "营业时间", answer: "周一到周日 07:00 - 22:00。" },
  { id: "kb-5", question: "杯型大小", answer: "有小杯 / 中杯 / 大杯；大杯加 8 元，中杯加 6 元。" },
];

function mockKBSearch(query: string): { id: string; question: string; answer: string } | null {
  // 简单关键字匹配（mock 检索）
  for (const item of MOCK_KB) {
    if (query.includes(item.question.replace("？", "")) || item.question.replace("？", "").includes(query)) {
      return item;
    }
  }
  // fallback：随便给第一条
  return MOCK_KB[0];
}

// ── Mock LLM 汇总（让右栏的 Agent 循环看起来真）──

function mockLLMSummarize(query: string, kbHits: { id: string; answer: string }[]): string {
  // 简单拼：拿 KB 第一条做答复
  if (kbHits.length === 0) return "（KB 没检索到东西 —— 没法汇总）";
  return `基于知识库检索结果（${kbHits.length} 条）：${kbHits[0].answer}`;
}

// ── 左栏主流程：知识库节点 ──

/**
 * 知识库节点 —— 拖一个 KB 检索节点：调一次 mock KB 检索 → 拿到 top-1 → 输出（**不循环**）。
 * 教学点：拖一个知识库节点 ≠ Agent 循环 —— 检索一次就停，停了不会自己再调一次。
 */
export function runKBNode(input: KBNodeInput): KBNodeOutput {
  logger.info(
    "│ 调用函数-runKBNode",
    "调用函数开始：runKBNode",
    "为什么写这条日志：左栏主流程 —— 知识库节点（拖一个 KB 检索节点）：调一次 mock KB 检索 → 拿到 top-1 → 输出（**不循环**）。教学点：「它会自己循环查资料」是对「Agent 循环节点」的脑补，不是对「知识库节点」的脑补 —— 知识库节点调一次就停。",
    {
      入参: input,
      __code: "const out = runKBNode({ query });",
    },
  );
  const t0 = Date.now();

  const top = mockKBSearch(input.query);
  const turns: TurnRecord[] = [];
  let finalReply = "（KB 没检索到东西）";
  if (top) {
    turns.push({ round: 1, action: "调知识库", result: top.answer });
    finalReply = top.answer;
  }

  const out: KBNodeOutput = {
    query: input.query,
    rounds: turns.length,
    finalReply,
    turns,
    hasLoop: false,
    stoppedReason: "natural",
  };

  logger.info(
    "│ 调用函数-runKBNode",
    "调用函数结束：runKBNode",
    "为什么写这条日志：左栏只调一次 KB → 拿到 top-1 → 输出；rounds=1 · hasLoop=false。前端用 rounds=1 + hasLoop=false 对照右栏。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}

// ── 右栏主流程：Agent 循环节点（带 KB 检索 + LLM 汇总）──

/**
 * Agent 循环节点 —— while：调 LLM（mock 决策）→ 模型可能再调 KB → 拿到 top-K → 汇总
 * 教学点：Agent 循环节点 = 把「LLM + 调工具」塞进一个方块 —— 模型自己决定要不要调，调几次。
 */
export function runAgentNodeWithKB(input: KBNodeInput): KBNodeOutput {
  logger.info(
    "│ 调用函数-runAgentNodeWithKB",
    "调用函数开始：runAgentNodeWithKB",
    "为什么写这条日志：右栏主流程 —— Agent 循环节点（带 KB 检索 + LLM 汇总）。while：调 LLM（mock 决策）→ 模型可能再调 KB → 拿到 top-K → 调 LLM 汇总 → finalReply。教学点：Agent 循环节点 = 模块 07 的 while + 调工具塞进一个方块。",
    {
      入参: input,
      __code: "const out = runAgentNodeWithKB({ query });",
    },
  );
  const t0 = Date.now();

  const turns: TurnRecord[] = [];
  const kbHits: Array<{ id: string; answer: string }> = [];
  let round = 0;
  let finalReply = "";

  // ── 第一圈：调 KB（mock 模型决策：第一次总是调 KB）──
  round++;
  const firstHit = mockKBSearch(input.query);
  if (firstHit) {
    kbHits.push({ id: firstHit.id, answer: firstHit.answer });
    turns.push({ round, action: "调知识库", result: firstHit.answer });
  }

  // ── 第二圈：mock 模型决策 → 看第一轮的 KB 够不够 → 不够就再调一次 ──
  round++;
  const secondHit = MOCK_KB.find((item) => item.id !== firstHit?.id);
  if (secondHit && kbHits.length < 2) {
    kbHits.push({ id: secondHit.id, answer: secondHit.answer });
    turns.push({ round, action: "调知识库", result: secondHit.answer });
  }

  // ── 第三圈：调 LLM 汇总 ──
  round++;
  finalReply = mockLLMSummarize(input.query, kbHits);
  turns.push({ round, action: "调 LLM 汇总", result: finalReply });

  const out: KBNodeOutput = {
    query: input.query,
    rounds: round,
    finalReply,
    turns,
    hasLoop: true,
    stoppedReason: "natural",
  };

  logger.info(
    "│ 调用函数-runAgentNodeWithKB",
    "调用函数结束：runAgentNodeWithKB",
    "为什么写这条日志：右栏 Agent 循环节点跑了 3 圈（KB + KB + LLM 汇总）→ finalReply 是 LLM 看了 KB 之后汇总的。前端用 rounds=3 + hasLoop=true 对照左栏。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
    },
  );
  return out;
}