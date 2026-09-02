/**
 * 模块 00 · 最小流式对话入口（协议 A · OpenAI 兼容）
 *
 * 职责：从命令行读一条用户消息，调用 MiniMax Chat Completions API，
 *       把模型回复以 Streaming（流式）方式打印到控制台，并输出 Token 用量。
 *
 * 数据流：
 *   apps/.env → getLlm() → 当前提供商的协议 A（OpenAI SDK）
 *   → chat.completions.create({ stream: true }) → 逐 chunk 打印 → 汇总 usage
 *
 * 对照：
 *   - 协议 B：index-anthropic.ts（同一 getLlm() 的 anthropic 客户端）
 *   - HTTP + SSE：server.ts（GET / 返回浏览器页；POST /api/chat 返回 SSE 流）
 *   - 进阶能力（AbortController 演示、Rate-Limit 重试等）在 apps/02-LLM-API开发/
 *     各小节里，**不**塞进本入口（演示动作会污染产品入口）
 *
 * 对应路径：apps/00-环境准备/01-mini-app/src/index.ts
 *
 * 概念 / 取舍 / 踩坑：docs/学习模块/00-环境准备/
 */

import OpenAI from "openai";
import { getLlm } from "../../../llm.js";

const llm = getLlm();
const client = llm.openai;

// 命令行参数拼成用户消息；无参数时用默认问题，方便直接验证环境
const userMessage =
  process.argv.slice(2).join(" ").trim() || "用3000字介绍你自己。";

async function main() {
  console.log(`> ${userMessage}\n`);
  console.log(`[协议 A · OpenAI Chat Completions · ${llm.provider} · ${llm.modelA}]\n`);

  // 流式响应：create() 返回 AsyncIterable，把流当成 result 直接交给 for await
  const stream = await client.chat.completions.create({
    model: llm.modelA,
    messages: [{ role: "user", content: userMessage }],
    stream: true,
    // 部分兼容 API 支持在流式最后一帧带上 usage；不支持则后面走控制台查账单
    stream_options: { include_usage: true },
  });

  process.stdout.write("Assistant: ");

  // 流结束后用于打印 Token 统计；可能为 undefined（取决于厂商是否在流里返回 usage）
  let usage: OpenAI.Completions.CompletionUsage | undefined;

  // for await：异步迭代器，每收到一个 chunk 处理一块（前端类比：消费 SSE 的 onmessage）
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
