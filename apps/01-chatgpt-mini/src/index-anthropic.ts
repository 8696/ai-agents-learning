/**
 * 协议 B 对照入口（允许在模块 00 超前放置；对照验收在模块 02）
 *
 * 职责：与 index.ts 相同的最小闭环，但走 **协议 B**（Anthropic Messages API）：
 *       使用 @anthropic-ai/sdk + MiniMax 国内 /anthropic 端点（与 OpenAI 兼容版共用 MINIMAX_API_KEY）。
 *
 * 数据流：
 *   apps/.env → Zod 校验 → Anthropic SDK（baseURL → api.minimaxi.com/anthropic）
 *   → messages.stream() → content_block_delta 逐块打印 → finalMessage.usage
 *
 * 对照：index.ts 用 openai 包 + /v1；本文件用 @anthropic-ai/sdk + /anthropic（同 Key）
 *
 * 对应路径：apps/01-chatgpt-mini/src/index-anthropic.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { loadRootEnv } from "./load-root-env.js";

// ── 1. 加载环境变量 ──
loadRootEnv();

// ── 2. Zod 校验（协议 B 专用变量；Key 仍与协议 A 共用 MINIMAX_API_KEY）──
const envSchema = z.object({
  MINIMAX_API_KEY: z
    .string()
    .min(1, "请在 apps/.env 中设置 MINIMAX_API_KEY（见 apps/.env.example）"),
  // Anthropic 兼容端点：路径是 /anthropic，不是 /v1
  MINIMAX_ANTHROPIC_BASE_URL: z
    .string()
    .url()
    .default("https://api.minimaxi.com/anthropic"),
  MINIMAX_ANTHROPIC_MODEL: z.string().default("MiniMax-M3"),
  // Messages API 必填 max_tokens；学习阶段给一个足够大的上限
  MINIMAX_ANTHROPIC_MAX_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(1024),
});

const env = envSchema.parse(process.env);

// ── 3. Anthropic SDK 客户端（Key 与 OpenAI 兼容版相同，只换 baseURL）──
const client = new Anthropic({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_ANTHROPIC_BASE_URL,
});

const userMessage =
  process.argv.slice(2).join(" ").trim() || "用一句话介绍你自己。";

async function main() {
  console.log(`> ${userMessage}\n`);
  console.log(
    `[协议 B · Anthropic Messages API · ${env.MINIMAX_ANTHROPIC_MODEL}]\n`,
  );

  // messages.stream：返回可 async 迭代的 MessageStream（类似 openai 的 stream: true）
  const stream = client.messages.stream({
    model: env.MINIMAX_ANTHROPIC_MODEL,
    max_tokens: env.MINIMAX_ANTHROPIC_MAX_TOKENS,
    messages: [{ role: "user", content: userMessage }],
  });

  process.stdout.write("Assistant: ");

  // 事件类型与 OpenAI 的 choices[0].delta.content 不同，需认 content_block_delta
  stream.on("text", (textDelta: string) => {
    process.stdout.write(textDelta);
  });

  // 等待流结束并拿到完整 Message（含 usage）
  const finalMessage = await stream.finalMessage();

  process.stdout.write("\n\n");

  if (finalMessage.usage) {
    console.log("Token 用量:", {
      input: finalMessage.usage.input_tokens,
      output: finalMessage.usage.output_tokens,
      // Anthropic 用 input/output；OpenAI 兼容版用 prompt/completion，命名不同但含义对应
      total:
        finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
    });
  } else {
    console.log(
      "提示：未返回 usage。可在 MiniMax 国内控制台查看用量：",
      "https://platform.minimaxi.com/user-center/payment/balance",
    );
  }
}

main().catch((error: unknown) => {
  console.error("请求失败:", error);
  process.exit(1);
});
