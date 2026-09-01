/**
 * 模块 00 + 02 · 流式 / 非流式对话入口（协议 A · OpenAI 兼容）
 *
 * 职责：从命令行读一条用户消息，调用 MiniMax Chat Completions API；
 *       流式（默认）逐 chunk 打印 + 用量 / 成本估算；
 *       --no-stream 走一次性返回（用于成本可控的小请求 / 测试）。
 *
 * 数据流：
 *   apps/.env → Zod 校验（含 MINIMAX_PRICE_PER_1K 单价） → OpenAI SDK 客户端
 *     → 流式：retryWithBackoff 包 create(stream:true)
 *             → for await 逐 chunk 打印 + 第一个 chunk 后 3 秒自动 controller.abort()
 *     → 非流式：retryWithBackoff 包 create()
 *               → 直接打印 message.content + usage / cost
 *
 * 对照：协议 B 见 index-anthropic.ts（@anthropic-ai/sdk + /anthropic，同 MINIMAX_API_KEY）
 *
 * 对应路径：apps/01-chatgpt-mini/src/index.ts
 *
 * 已回填：
 *   - 模块 02 · 03-AbortController：流式路径第一个 chunk 到 → setTimeout 3 秒 → controller.abort()
 *     → signal 传 SDK → catch AbortError → 打印"[已中止]"并 exit 0；详见
 *     [03-AbortController 小节 MD](../../docs/学习模块/02-LLM-API开发/03-AbortController.md)
 *   - 模块 02 · 04-Rate-Limit：create() 外套 retryWithBackoff（429 / 5xx / 网络错退避重试，
 *     401 / 404 等不可重试立刻抛 NonRetryableError）；signal 与 03 那条共用。
 *     本条最小一刀：只动 src/index.ts 流式路径；server.ts 与 index-anthropic.ts 留到本地产出。
 *     详见 [04-Rate-Limit 小节 MD](../../docs/学习模块/02-LLM-API开发/04-Rate-Limit.md)
 *   - 模块 02 · 本地产出收口：加 --no-stream 走非流式路径；加 printUsageAndCost（基于
 *     MINIMAX_PRICE_PER_1K 单价算成本）；详见
 *     [05-本地产出 小节 MD](../../docs/学习模块/02-LLM-API开发/05-本地产出.md)
 */

import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "./load-root-env.js";
import {
  retryWithBackoff,
  NonRetryableError,
  RetryExhaustedError,
  DEFAULT_RETRY_OPTIONS,
  type AttemptRecord,
} from "./retry.js";

// ── 1. 加载环境变量（配置集中在 apps/，不在此子项目重复维护 .env）──
loadRootEnv();

// ── 2. 用 Zod 校验并解析环境变量 ────────────────────────────

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
  // 模块 02 收口：成本估算单价（每 1k tokens，¥）；查 vendor 控制台填实际值
  // 默认 0.001 是 MiniMax-M3 的占位价；Zod parse 拿不到时 fallback 到这里
  MINIMAX_PRICE_PER_1K: z.coerce.number().nonnegative().default(0.001),
});

const env = envSchema.parse(process.env);

// ── 3. 创建 OpenAI 兼容客户端（MiniMax 走 Chat Completions 协议）──

const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

// ── 4. 解析命令行参数 ──────────────────────────────────────
//   yarn dev "你好"                    → 流式
//   yarn dev --no-stream "你好"        → 非流式（一次性返回）
//   yarn dev                           → 默认 prompt
const args = process.argv.slice(2);
const useStream = !args.includes("--no-stream");
const userMessage =
  args.filter((a) => a !== "--no-stream").join(" ").trim() ||
  "用3000字介绍你自己。";

// 模块 02 · 03-AbortController：流式路径收到第一个 chunk 后 3 秒自动 abort
// 模块 02 · 04-Rate-Limit：把这个 signal 同时传给 retryWithBackoff
// 非流式路径没有"中途取消"的语义（一次性返回没法中止），不挂自动 abort
const controller = new AbortController();

// ── 5. 共用：打印 usage + 估算成本 ─────────────────────────
//   公式：cost = total_tokens / 1000 × MINIMAX_PRICE_PER_1K
//   单价 env 化：不写死在代码里；不同模型 / 不同套餐自己改
function printUsageAndCost(usage: OpenAI.Completions.CompletionUsage): void {
  const costYuan = (usage.total_tokens / 1000) * env.MINIMAX_PRICE_PER_1K;
  console.log("Token 用量:", {
    prompt: usage.prompt_tokens,
    completion: usage.completion_tokens,
    total: usage.total_tokens,
  });
  console.log(
    `估算成本：¥ ${costYuan.toFixed(6)}` +
      `（单价 ${env.MINIMAX_PRICE_PER_1K} 元/1k token，由 MINIMAX_PRICE_PER_1K 控制）`,
  );
}

function logRetry(attempts: AttemptRecord[]): void {
  if (attempts.length > 1) {
    console.error(
      `[retry] 共 ${attempts.length} 次 attempt：${attempts.map((a) => a.status).join(" → ")}`,
    );
  }
}

// ── 6. 主入口：根据 useStream 走流式 / 非流式 ────────────────
async function main() {
  console.log(`> ${userMessage}\n`);
  console.log(
    `[协议 A · OpenAI Chat Completions · ${env.MINIMAX_MODEL} · ${useStream ? "stream" : "no-stream"}]\n`,
  );

  if (useStream) {
    await runStream();
  } else {
    await runNoStream();
  }
}

// ── 7. 流式路径：模块 00 验收 + 02 / 03-AbortController + 02 / 04-Rate-Limit ──
async function runStream() {
  // 模块 02 · 04-Rate-Limit：把 create() 套上 retryWithBackoff
  //   - 429 / 408 / 5xx / 网络错 → 指数退避 + jitter + 听 Retry-After，最多 3 次
  //   - 400 / 401 / 403 / 404 / 422 → NonRetryableError，不重试
  //   - 中途收到外部 abort（用户取消）→ 立刻停手
  const { result: stream, attempts } = await retryWithBackoff(
    async (signal) => {
      try {
        const s = await client.chat.completions.create(
          {
            model: env.MINIMAX_MODEL,
            messages: [{ role: "user", content: userMessage }],
            stream: true,
            // 部分兼容 API 支持在流式最后一包带上 usage；不支持则后面走控制台查账单
            stream_options: { include_usage: true },
          },
          { signal },
        );
        return { status: 200, body: s, headers: new Headers() };
      } catch (err) {
        // OpenAI SDK 把 HTTP 错包成 APIError（含 .status / .headers / .error.message）
        // 网络错 / AbortError 没有 .status，原样抛 → retry 层当作 network 重试
        const apiErr = err as {
          status?: number;
          headers?: Record<string, string>;
          message?: string;
          error?: { message?: string };
        };
        if (typeof apiErr.status === "number") {
          return {
            status: apiErr.status,
            body: apiErr.error?.message ?? apiErr.message ?? String(err),
            headers: new Headers(apiErr.headers ?? {}),
          };
        }
        throw err;
      }
    },
    { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, maxTotalTimeMs: 60_000, signal: controller.signal },
  );
  logRetry(attempts);

  process.stdout.write("Assistant: ");

  // 流结束后用于打印 Token / 成本；可能为 undefined
  let usage: OpenAI.Completions.CompletionUsage | undefined;
  let firstChunkAt: number | null = null;
  let abortTimer: NodeJS.Timeout | null = null;

  // for await：异步迭代器，每收到一个 chunk 就处理一块（前端类比：消费 SSE 的 onmessage）
  for await (const chunk of stream) {
    // 第一个 chunk 到的时间点 = 开始生成；启动 3 秒定时器（模拟用户读了会儿中途取消）
    if (firstChunkAt === null) {
      firstChunkAt = Date.now();
      abortTimer = setTimeout(() => {
        console.log("\n\n[3 秒到 → 模拟用户中途取消] controller.abort()");
        controller.abort();
      }, 3000);
    }

    // delta.content 是本 chunk 新增的文本片段，不是完整回复
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      process.stdout.write(delta);
    }
    if (chunk.usage) {
      usage = chunk.usage;
    }
  }

  // 流正常跑完 → 清掉定时器（不会触发，但保险）
  if (abortTimer) clearTimeout(abortTimer);

  process.stdout.write("\n\n");

  if (usage) {
    printUsageAndCost(usage);
  } else {
    console.log(
      "提示：本次流式响应未返回 usage。可在 MiniMax 国内控制台查看用量：",
      "https://platform.minimaxi.com/user-center/payment/balance",
    );
  }
}

// ── 8. 非流式路径：模块 02 收口（验收第 1 / 4 项） ───────────────
async function runNoStream() {
  // 一次性 create()：不传 stream:true，OpenAI SDK 返回 ChatCompletion（含 message + usage）
  // 仍套 retryWithBackoff：429 / 5xx / 网络错照样退避；401 / 404 照样 NonRetryable
  const { result: completion, attempts } = await retryWithBackoff<OpenAI.ChatCompletion>(
    async (signal) => {
      try {
        const c = await client.chat.completions.create(
          {
            model: env.MINIMAX_MODEL,
            messages: [{ role: "user", content: userMessage }],
          },
          { signal },
        );
        return { status: 200, body: c, headers: new Headers() };
      } catch (err) {
        const apiErr = err as {
          status?: number;
          headers?: Record<string, string>;
          message?: string;
          error?: { message?: string };
        };
        if (typeof apiErr.status === "number") {
          return {
            status: apiErr.status,
            body: apiErr.error?.message ?? apiErr.message ?? String(err),
            headers: new Headers(apiErr.headers ?? {}),
          };
        }
        throw err;
      }
    },
    { ...DEFAULT_RETRY_OPTIONS, maxAttempts: 3, maxTotalTimeMs: 60_000, signal: controller.signal },
  );
  logRetry(attempts);

  const content = completion.choices[0]?.message?.content ?? "";
  process.stdout.write("Assistant: ");
  process.stdout.write(content);
  process.stdout.write("\n\n");

  if (completion.usage) {
    printUsageAndCost(completion.usage);
  }
}

main().catch((error: unknown) => {
  // AbortError / APIUserAbortError 不是失败：用户主动取消，正常退出
  if (
    error instanceof Error &&
    (error.name === "AbortError" ||
      error.constructor.name === "APIUserAbortError")
  ) {
    console.log(
      "[已中止] 之前已生成的 token 仍会计费（abort 是关读取 ≠ 之前免费）。",
      "可在 MiniMax 控制台查实际用量：",
      "https://platform.minimaxi.com/user-center/payment/balance",
    );
    process.exit(0);
  }

  // 模块 02 · 04-Rate-Limit：不可重试错误（401/403/404/422 等）
  if (error instanceof NonRetryableError) {
    console.error(
      `[不可重试] HTTP ${error.status}: ${error.message}`,
    );
    console.error(
      "  提示：",
      {
        400: "请求参数错；检查 message 结构 / temperature 等",
        401: "Key 错或过期；检查 apps/.env 里的 MINIMAX_API_KEY",
        403: "权限不足；Key 可能没开对应模型权限",
        404: "模型名 / 端点不存在；检查 MINIMAX_MODEL / MINIMAX_BASE_URL",
        422: "参数语义错；某些字段类型 / 范围不对",
      }[error.status] ?? "查看 SDK 报错",
    );
    process.exit(1);
  }

  // 模块 02 · 04-Rate-Limit：重试耗尽
  if (error instanceof RetryExhaustedError) {
    const statuses = error.attempts.map((a) => a.status).join(" → ");
    console.error(
      `[重试耗尽] ${error.attempts.length} 次 attempt 都失败：${statuses}`,
    );
    console.error(
      "  提示：等几秒再试；或降并发；或换次级模型（如 haiku / flash）。",
    );
    console.error(
      "  若 401 / 404 频繁出现：检查 apps/.env 里的 Key / 模型名是否对。",
    );
    process.exit(1);
  }

  console.error("请求失败:", error);
  process.exit(1);
});
