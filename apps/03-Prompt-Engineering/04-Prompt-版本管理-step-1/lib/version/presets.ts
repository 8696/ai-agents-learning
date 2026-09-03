/**
 * 职责：两版 Prompt 的产品常量 —— 共用 System、版本名、默认 User 末尾、预置题目。
 * 数据流：被 flow/run-one 拼进 messages；被 /health 带回前端，页面默认值不写死在两处。
 * 变量只剩「User 末尾那一句」：System 两版共用，才能归因到一字之差。
 */
export const SYSTEM_PROMPT = "你是答题助理。请只回答用户的问题，不要跑题。";

export const VERSION_NAMES = {
  v1: "v1.0.0",
  v2: "v1.1.0",
} as const;

export type Mode = "v1" | "v2";

export const DEFAULT_PROMPTS = {
  v1: "请回答下列问题，直接给出最终答案，不要解释、不要列出推理步骤。",
  v2: "请回答下列问题。Let's think step by step, then give the final answer.",
} as const;

export const SAMPLE_QUESTIONS = [
  {
    id: "math",
    title: "追击问题（数学）",
    text: "火车 A 以 60 km/h 出发 2 小时后，火车 B 以 90 km/h 从同一地点出发。多久后 B 追上 A？",
  },
  {
    id: "subj",
    title: "含混分类",
    text: "产品不错，但物流太慢了，两周才到。",
  },
  {
    id: "prime",
    title: "质数拆分",
    text: "把 24 写成三个素数之和，按升序列出来。",
  },
  {
    id: "sort",
    title: "数字排序",
    text: "把这组数从大到小排序：3.14、π 的近似 3.14159、e 的近似 2.71828。",
  },
  {
    id: "irony",
    title: "反讽判断",
    text: "太精彩了，我都看哭了。这家餐厅的服务真是'一流'。",
  },
] as const;
