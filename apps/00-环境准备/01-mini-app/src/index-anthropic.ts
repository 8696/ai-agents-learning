/**
 * 模块 00 · 协议 B 对照入口（Anthropic Messages API）
 *
 * 职责：与 index.ts 相同的最小闭环，但走 **协议 B**（Anthropic Messages API）：
 *       使用 @anthropic-ai/sdk + MiniMax 国内 /anthropic 端点（与 OpenAI 兼容版共用 MINIMAX_API_KEY）。
 *
 * 数据流：
 *   apps/.env → Zod 校验 → Anthropic SDK（baseURL → api.minimaxi.com/anthropic）
 *   → messages.stream(body) → content_block_delta 事件流
 *   → 监听 'text' 事件拿到 delta 文本
 *   → await stream.finalMessage() → 拿 usage / stop_reason
 *
 * 对照：index.ts 用 openai 包 + /v1 + for await；本文件用 @anthropic-ai/sdk + /anthropic（同 Key）
 *
 * 注意：
 *   - 协议 A/B 用同一把 MINIMAX_API_KEY（同 Key 不同 baseURL）
 *   - 协议 B 的流是事件流（message_start / content_block_delta / message_stop ...），
 *     不是 async iterable，监听 'text' 拿到的是已经 decode 后的文本增量
 *   - 进阶能力（取消、限流等演示）在 apps/02-LLM-API开发/ 对应小节，**不**塞进本入口
 *
 * 对应路径：apps/00-环境准备/01-mini-app/src/index-anthropic.ts
 *
 * 概念 / 取舍 / 踩坑：docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { loadRootEnv } from "../../../load-root-env.js";

// ── 1. 加载环境变量 ──
loadRootEnv();

// ── 2. Zod 校验（协议 B 专用变量；Key 仍与协议 A 共用 MINIMAX_API_KEY） ──
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

// ── 3. Anthropic SDK 客户端（Key 与 OpenAI 兼容版相同，只换 baseURL） ──
const client = new Anthropic({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_ANTHROPIC_BASE_URL,
});

const userMessage =
  process.argv.slice(2).join(" ").trim() || "用3000字介绍你自己。";

async function main() {
  console.log(`> ${userMessage}\n`);
  console.log(
    `[协议 B · Anthropic Messages API · ${env.MINIMAX_ANTHROPIC_MODEL}]\n`,
  );

  // messages.stream：返回 MessageStream（事件流模型），不是 async iterable
  const stream = client.messages.stream({
    model: env.MINIMAX_ANTHROPIC_MODEL,
    max_tokens: env.MINIMAX_ANTHROPIC_MAX_TOKENS,
    messages: [{ role: "user", content: userMessage }],
  });

  process.stdout.write("Assistant: ");

  // 监听 'text' 事件拿到已经 decode 后的文本增量
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
