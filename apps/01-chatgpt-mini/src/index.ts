/**
 * 模块 00 · 最小流式对话入口（协议 A · OpenAI 兼容）
 *
 * 职责：从命令行读一条用户消息，调用 MiniMax Chat Completions API，
 *       把模型回复以 Streaming（流式）方式打印到控制台，并输出 Token 用量。
 *
 * 数据流：
 *   apps/.env → Zod 校验 → OpenAI SDK 客户端（baseURL 指向 MiniMax /v1）
 *   → chat.completions.create(stream: true) → 逐 chunk 打印 → 汇总 usage
 *
 * 对照：协议 B 见 index-anthropic.ts（@anthropic-ai/sdk + /anthropic，同 MINIMAX_API_KEY）
 *
 * 对应路径：apps/01-chatgpt-mini/src/index.ts
 */

import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "./load-root-env.js";

// ── 1. 加载环境变量（配置集中在 apps/，不在此子项目重复维护 .env）──
loadRootEnv();

// ── 2. 用 Zod 校验并解析环境变量（启动失败要快，不要等 API 报错才发现 Key 没配）──

const envSchema = z.object({
  MINIMAX_API_KEY: z
    .string()
    .min(1, "请在 apps/.env 中设置 MINIMAX_API_KEY（见 apps/.env.example）"),
  // MiniMax 国内 OpenAI 兼容端点；不要用 api.minimax.io（海外站）
  MINIMAX_BASE_URL: z
    .string()
    .url()
    .default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
});

const env = envSchema.parse(process.env);

// ── 3. 创建 OpenAI 兼容客户端（MiniMax 走 Chat Completions 协议）──

const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

// 命令行参数拼成用户消息；无参数时用默认问题，方便直接 yarn dev 验证环境
const userMessage =
  process.argv.slice(2).join(" ").trim() || "用一句话介绍你自己。";

async function main() {
  console.log(`> ${userMessage}\n`);
  console.log(`[协议 A · OpenAI Chat Completions · ${env.MINIMAX_MODEL}]\n`);

  // stream: true → 服务端用 SSE 风格逐块返回，不必等整段生成完（类似前端的 ReadableStream）
  const stream = await client.chat.completions.create({
    model: env.MINIMAX_MODEL,
    messages: [{ role: "user", content: userMessage }],
    stream: true,
    // 部分兼容 API 支持在流式最后一包带上 usage；不支持则后面走控制台查账单
    stream_options: { include_usage: true },
  });

  process.stdout.write("Assistant: ");

  // 流结束后用于打印 Token 统计；可能为 undefined（取决于厂商是否在流里返回 usage）
  let usage: OpenAI.Completions.CompletionUsage | undefined;

  // for await：异步迭代器，每收到一个 chunk 就处理一块（前端类比：消费 SSE 的 onmessage）
  for await (const chunk of stream) {
    // delta.content 是本 chunk 新增的文本片段，不是完整回复
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      process.stdout.write(delta);
    }
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  process.stdout.write("\n\n");

  if (usage) {
    console.log("Token 用量:", {
      prompt: usage.prompt_tokens, // 输入侧 Token（含 system + 历史 + 本条 user）
      completion: usage.completion_tokens, // 模型生成侧 Token
      total: usage.total_tokens,
    });
  } else {
    console.log(
      "提示：本次流式响应未返回 usage。可在 MiniMax 国内控制台查看用量：",
      "https://platform.minimaxi.com/user-center/payment/balance",
    );
  }
}

main().catch((error: unknown) => {
  console.error("请求失败:", error);
  process.exit(1);
});
