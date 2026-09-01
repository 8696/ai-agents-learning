/**
 * 模块 00 · API Key / 计费 · 最小 Demo
 *
 * 职责：发一条极短非流式请求，打印输入 / 输出 Token 各是多少。
 * 为什么：本条要能讲清「按 Token 计费、输入输出分开」——合上笔记必须看见 usage 两行。
 *
 * 数据流：apps/.env → Zod → MiniMax 协议 A → chat.completions.create → 打印 usage
 */

import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "../../load-root-env.js";

loadRootEnv();

const env = z
  .object({
    MINIMAX_API_KEY: z
      .string()
      .min(1, "请在 apps/.env 中设置 MINIMAX_API_KEY"),
    MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/v1"),
    MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  })
  .parse(process.env);

const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

const completion = await client.chat.completions.create({
  model: env.MINIMAX_MODEL,
  messages: [{ role: "user", content: "只回复一个字：好" }],
  max_tokens: 8,
  stream: false,
});

const usage = completion.usage;
if (!usage) {
  throw new Error("这次响应没有 usage。到 MiniMax 控制台账单页对照，不要猜。");
}

console.log("模型：", env.MINIMAX_MODEL);
console.log("回复：", completion.choices[0]?.message.content ?? "(空)");
console.log("");
console.log("输入 prompt_tokens     =", usage.prompt_tokens, "← 按输入单价计费");
console.log("输出 completion_tokens =", usage.completion_tokens, "← 按输出单价计费（通常更贵）");
console.log("合计 total_tokens      =", usage.total_tokens);
console.log("");
console.log("订阅网页能聊 ≠ 这把按量 API Key。账单仍要去控制台看，Demo 看不到订阅套餐。");
