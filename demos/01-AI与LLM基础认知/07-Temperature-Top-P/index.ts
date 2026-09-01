/**
 * 模块 01 · Temperature / Top-P · 最小 Demo
 *
 * 职责：同一句 prompt，T=0 跑两次、T=1.2 跑两次，把四段回复打出来。
 * 为什么：本条要能讲清「温度管随机性」——必须看见稳 vs 飘，不能只背定义。
 *
 * 数据流：apps/.env → MiniMax 协议 A → 四次非流式 create → 打印
 * Top-P 固定 1：先只动温度（与本条笔记「多数文档建议只调一个」对齐）
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

const prompt = "给一间开在海边的咖啡店起一个店名。只回店名四个字以内，不要解释。";

function visibleText(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function once(temperature: number): Promise<string> {
  const completion = await client.chat.completions.create({
    model: env.MINIMAX_MODEL,
    messages: [
      {
        role: "system",
        content: "只输出最终店名。不要分析过程，不要 XML 标签。",
      },
      { role: "user", content: prompt },
    ],
    temperature,
    top_p: 1,
    max_tokens: 256,
    stream: false,
  });
  const raw = completion.choices[0]?.message.content?.trim() ?? "(空)";
  const visible = visibleText(raw);
  return visible.length > 0 ? visible : raw;
}

console.log("prompt：", prompt);
console.log("top_p 固定 1，只动 temperature\n");

const t0a = await once(0);
const t0b = await once(0);
console.log("T=0 第 1 次：", t0a);
console.log("T=0 第 2 次：", t0b);
console.log(t0a === t0b ? "→ 两次相同或极近：低温度更稳（抽取任务常用）\n" : "→ 仍可能有一点差：厂商实现不一定绝对贪心，但应明显更稳\n");

const tha = await once(1.2);
const thb = await once(1.2);
console.log("T=1.2 第 1 次：", tha);
console.log("T=1.2 第 2 次：", thb);
console.log(tha === thb ? "→ 这次碰巧相同；再跑一遍或把温度再调高一点看分叉" : "→ 两次更容易不一样：高温度更飘（创意任务才加）");
