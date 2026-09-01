/**
 * 协议 B 对照入口（允许在模块 00 超前放置；对照验收在模块 02）
 *
 * 职责：与 index.ts 相同的最小闭环，但走 **协议 B**（Anthropic Messages API）：
 *       使用 @anthropic-ai/sdk + MiniMax 国内 /anthropic 端点（与 OpenAI 兼容版共用 MINIMAX_API_KEY）。
 *
 * 数据流：
 *   apps/.env → Zod 校验 → Anthropic SDK（baseURL → api.minimaxi.com/anthropic）
 *   → messages.stream(body, { signal }) → content_block_delta 事件流
 *   → 收到第一个 text 事件后 3 秒自动 controller.abort()（模拟用户读了会儿中途取消）
 *   → await stream.finalMessage() → 拿 usage / stop_reason
 *
 * 对照：index.ts 用 openai 包 + /v1 + for await；本文件用 @anthropic-ai/sdk + /anthropic（同 Key）
 *
 * 对应路径：apps/01-chatgpt-mini/src/index-anthropic.ts
 *
 * 已回填：
 *   - 模块 02 · 03-AbortController：第一个 text 事件到 → setTimeout 3 秒 → controller.abort()
 *     → signal 作为 messages.stream 的第二个 options 参数 → catch APIUserAbortError / AbortError →
 *     打印"[已中止]"并 exit 0；详见
 *     [03-AbortController 小节 MD](../../docs/学习模块/02-LLM-API开发/03-AbortController.md)
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
  process.argv.slice(2).join(" ").trim() || "用3000字介绍你自己。";

// 模块 02 · 03-AbortController：收到第一个 text 事件后 3 秒自动 abort，模拟用户读了会儿中途取消。
// signal 在 messages.stream 的第二个 options 参数里传（与 OpenAI SDK 同模式）。
const controller = new AbortController();
let abortTimer: NodeJS.Timeout | null = null;

async function main() {
  console.log(`> ${userMessage}\n`);
  console.log(
    `[协议 B · Anthropic Messages API · ${env.MINIMAX_ANTHROPIC_MODEL}]\n`,
  );

  // messages.stream：返回 MessageStream（事件流模型），不是 async iterable
  // signal 通过第二个 options 参数传给底层 fetch
  const stream = client.messages.stream(
    {
      model: env.MINIMAX_ANTHROPIC_MODEL,
      max_tokens: env.MINIMAX_ANTHROPIC_MAX_TOKENS,
      messages: [{ role: "user", content: userMessage }],
    },
    { signal: controller.signal },
  );

  process.stdout.write("Assistant: ");

  // 协议 B 的流是事件流（与 OpenAI 协议 A 的 for await chunks 不同）：
  //   message_start → content_block_start(text) → content_block_delta × N (text)
  //                 → content_block_stop → message_delta(usage, stop_reason) → message_stop
  // 监听 'text' 事件拿到的是已经 decode 后的文本增量（不是原始 delta 块），
  // 首个 text 触发时 = 模型已开始生成 → 启 3 秒定时器
  let firstTextAt: number | null = null;
  stream.on("text", (textDelta: string) => {
    if (firstTextAt === null) {
      firstTextAt = Date.now();
      abortTimer = setTimeout(() => {
        console.log(
          "\n\n[3 秒到 → 模拟用户中途取消] controller.abort()",
        );
        controller.abort();
      }, 3000);
    }
    process.stdout.write(textDelta);
  });

  // 等待流结束并拿到完整 Message（含 usage）；abort 时 SDK 会 reject APIUserAbortError
  const finalMessage = await stream.finalMessage();

  // 流跑完 → 清掉定时器（不会触发，但保险）
  if (abortTimer) clearTimeout(abortTimer);

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
  // AbortError / APIUserAbortError 不是失败：3 秒到，模拟用户中途取消，正常退出
  if (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.constructor.name === "APIUserAbortError" ||
      /abort/i.test(error.message ?? ""))
  ) {
    console.log(
      "[已中止] 之前已生成的 token 仍会计费（abort 是关读取 ≠ 之前免费）。",
      "可在 MiniMax 控制台查实际用量：",
      "https://platform.minimaxi.com/user-center/payment/balance",
    );
    process.exit(0);
  }
  console.error("请求失败:", error);
  process.exit(1);
});
