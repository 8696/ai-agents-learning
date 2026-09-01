/**
 * 模块 02 · AbortController · 对照 Demo（用真实线上对话）
 *
 * 职责：起一个 HTTP server，暴露三个流式端点 + 一个浏览器页面，让学习者肉眼对比：
 *   1. /api/full          — 不取消，跑到底（对照基线）
 *   2. /api/cancel-after-N— 客户端先收 N 帧就 abort（让学习者按"按到哪帧就停"做对照）
 *   3. /api/no-signal-abort — 故意不传 signal，模拟"忘了传 signal"：abort 不生效，看服务端是否跑完
 *
 *   浏览器页面（GET /）：
 *     - 三个按钮对应三个端点
 *     - 逐帧渲染 + 显示累计耗时 + 是否拿到 usage
 *
 * 数据流：
 *   浏览器 POST /api/full
 *     → openai SDK stream:true (无 signal)
 *     → 逐帧 SSE → for await delta.content → res.write
 *     → 完成 → usage 帧 → res.end
 *   浏览器 POST /api/cancel-after-N
 *     → openai SDK stream:true (signal: controller.signal)
 *     → 收 N 帧后 controller.abort()（或者页面点"立即取消"按钮）
 *     → for await 抛 AbortError → catch 里发"aborted"帧 → res.end
 *   浏览器 POST /api/no-signal-abort
 *     → 故意不传 signal → 模拟用户按 Ctrl+C
 *     → 服务端继续跑完（abort 无效）→ 看是否拿到 usage
 *
 * 为什么：必须真按一次"取消"按钮，看到「客户端停了、服务端在 catch 里收到 AbortError 停了，
 * 帧数明显少于 full 端点」才能把"客户端停 ≠ 服务端停"+"abort 是关 socket 不是停生成"+"已生成的 token 算钱"讲清。
 *
 * 概念/取舍/踩坑：docs/学习模块/02-LLM-API开发/03-AbortController.md
 *
 * 跑前需要：apps/.env 里填 MINIMAX_API_KEY（模块 00 已有）。
 */
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "../../load-root-env.js";

loadRootEnv();

// ── 1) 环境变量校验 ──
const envSchema = z.object({
  MINIMAX_API_KEY: z.string().min(1, "请在 apps/.env 填 MINIMAX_API_KEY"),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  PORT: z.coerce.number().int().positive().default(5175),
});
const env = envSchema.parse(process.env);

const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

// ── 2) 请求体校验 ──
// abortAfterFrames 仅 /api/cancel-after-frames 用
const bodySchema = z.object({
  message: z.string().min(1).default("用 200 字介绍一下你自己"),
  abortAfterFrames: z.number().int().positive().max(200).default(5),
});
type Body = z.infer<typeof bodySchema>;

// ── 3) 一次性 HTML（启动时读进内存） ──
const html = readFileSync(
  fileURLToPath(new URL("./public/index.html", import.meta.url)),
  "utf-8",
);

// ── 4) HTTP server 路由 ──
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        model: env.MINIMAX_MODEL,
        port: env.PORT,
        endpoints: [
          "POST /api/full",
          "POST /api/cancel-after-frames",
          "POST /api/no-signal-abort",
        ],
      }),
    );
    return;
  }

  // 对照基线：不取消，跑到底
  if (req.method === "POST" && req.url === "/api/full") {
    const body = await readBody(req);
    await handleFull(body, res);
    return;
  }

  // 中途取消：服务端收 N 帧后 abort；客户端页面点"立即取消"按钮也走这里
  if (req.method === "POST" && req.url === "/api/cancel-after-frames") {
    const body = await readBody(req);
    await handleCancelAfterFrames(body, req, res);
    return;
  }

  // 故意不传 signal：abort 应该无效；服务端会跑完
  if (req.method === "POST" && req.url === "/api/no-signal-abort") {
    const body = await readBody(req);
    await handleNoSignalAbort(body, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

// ── 5) 读 body ──
async function readBody(req: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return bodySchema.parse({}); // 默认值
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
  return bodySchema.parse(json);
}

// ── 6) /api/full：不取消，跑到底 ──
async function handleFull(body: Body, res: ServerResponse): Promise<void> {
  const t0 = performance.now();
  let frameIdx = 0;
  let usage: unknown = null;

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/full: messages.length=1, signal=无, 客户端不取消`,
  );

  try {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // 故意不传 signal
    const stream = await client.chat.completions.create({
      model: env.MINIMAX_MODEL,
      messages: [{ role: "user", content: body.message }],
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      frameIdx += 1;
      const plain = JSON.parse(JSON.stringify(chunk));
      const delta = plain.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        res.write(
          `data: ${JSON.stringify({ event: "delta", frameIdx, content: delta })}\n\n`,
        );
      }
      if (plain.usage) usage = plain.usage;
    }

    res.write(
      `data: ${JSON.stringify({ event: "usage", frameIdx, usage })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();

    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/full: ✅ 完成 | 耗时 ${(performance.now() - t0).toFixed(0)}ms | 帧数 ${frameIdx} | usage ${usage ? `${(usage as { total_tokens: number }).total_tokens} tokens` : "未拿到"}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/full error:`,
      err,
    );
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    } else {
      try {
        res.write(
          `data: ${JSON.stringify({ event: "error", message: msg, frameIdx })}\n\n`,
        );
        res.end();
      } catch {
        // res 已 destroy
      }
    }
  }
}

// ── 7) /api/cancel-after-frames：服务端收 N 帧后自动 abort；或客户端 pagehide 时 abort ──
async function handleCancelAfterFrames(
  body: Body,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const t0 = performance.now();
  let frameIdx = 0;
  let aborted = false;
  let abortReason: "frames" | "client-close" | "manual" = "frames";
  let usage: unknown = null;

  // 关键：controller + signal
  const controller = new AbortController();

  // (a) 服务端到 N 帧后自动 abort
  const targetFrames = body.abortAfterFrames;

  // (b) 客户端断连（页面关 / 网络断）→ abort
  req.on("close", () => {
    if (!aborted) {
      aborted = true;
      abortReason = "client-close";
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: 客户端断开（pagehide / 网络断）→ controller.abort()`,
      );
      controller.abort();
    }
  });

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/cancel-after-frames: signal=有, abortAfterFrames=${targetFrames}`,
  );

  try {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // 关键：传 signal — OpenAI SDK 的 signal 在第二个 options 参数，不在 body 里
    const stream = await client.chat.completions.create(
      {
        model: env.MINIMAX_MODEL,
        messages: [{ role: "user", content: body.message }],
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: controller.signal },
    );

    for await (const chunk of stream) {
      frameIdx += 1;
      const plain = JSON.parse(JSON.stringify(chunk));
      const delta = plain.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        res.write(
          `data: ${JSON.stringify({ event: "delta", frameIdx, content: delta })}\n\n`,
        );
      }
      if (plain.usage) usage = plain.usage;

      // 服务端到 N 帧就 abort（模拟客户端按钮）
      if (frameIdx >= targetFrames && !aborted) {
        aborted = true;
        abortReason = "frames";
        console.log(
          `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: 已收 ${frameIdx} 帧 → controller.abort()（abortAfterFrames=${targetFrames}）`,
        );
        controller.abort();
        // 立刻 break 不行，要等 for await 自己 reject
      }
    }

    // 正常完成（不应该走到这里——targetFrames >= 1 就 abort）
    res.write(
      `data: ${JSON.stringify({ event: "usage", frameIdx, usage })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();

    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: ✅ 流跑完 | 耗时 ${(performance.now() - t0).toFixed(0)}ms | 帧数 ${frameIdx}`,
    );
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" ||
        err.constructor.name === "APIUserAbortError" ||
        err.message.toLowerCase().includes("abort"));

    if (isAbort) {
      // 关键：服务端 catch 到 AbortError → 立刻发"aborted"事件帧 → res.end
      // **不**继续写 delta（已经没人接了）
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: 🛑 AbortError caught | 写了 ${frameIdx} 帧 | 耗时 ${(performance.now() - t0).toFixed(0)}ms | usage ${usage ? "已记录" : "未拿到（流提前结束）"}`,
      );
      try {
        res.write(
          `data: ${JSON.stringify({
            event: "aborted",
            reason: abortReason,
            frameIdx,
            elapsedMs: Math.round(performance.now() - t0),
            usage,
          })}\n\n`,
        );
        res.end();
      } catch (writeErr: unknown) {
        // res 可能已 destroy（客户端断连时）
        console.log(
          `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: res 已 destroy，不再写`,
        );
      }
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames error:`,
        err,
      );
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg }));
      } else {
        try {
          res.write(
            `data: ${JSON.stringify({ event: "error", message: msg, frameIdx })}\n\n`,
          );
          res.end();
        } catch {
          // ignore
        }
      }
    }
  }
}

// ── 8) /api/no-signal-abort：故意不传 signal，对照"忘了传 signal 会怎样" ──
async function handleNoSignalAbort(
  body: Body,
  res: ServerResponse,
): Promise<void> {
  const t0 = performance.now();
  let frameIdx = 0;
  let usage: unknown = null;

  // 模拟"客户端按 Ctrl-C"：5 秒后强行调用 res.end() 关 SSE，
  // 但**不**传 signal 给 SDK。SDK 不知道，继续跑；服务端拿不到 cancel 信号。
  setTimeout(() => {
    if (!res.writableEnded) {
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: 5s 到 → 强制 res.end() 关 SSE（**没传 signal，SDK 继续跑**）`,
      );
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }, 5000);

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/no-signal-abort: signal=故意不传，5s 后 res.end() 模拟客户端关连接`,
  );

  try {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // 故意不传 signal
    const stream = await client.chat.completions.create({
      model: env.MINIMAX_MODEL,
      messages: [{ role: "user", content: body.message }],
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      frameIdx += 1;
      const plain = JSON.parse(JSON.stringify(chunk));
      const delta = plain.choices?.[0]?.delta?.content ?? "";
      // res 可能已被 res.end() 关掉 → write 会抛 ERR_STREAM_DESTROYED
      try {
        if (delta) {
          res.write(
            `data: ${JSON.stringify({ event: "delta", frameIdx, content: delta })}\n\n`,
          );
        }
        if (plain.usage) usage = plain.usage;
      } catch (writeErr: unknown) {
        console.log(
          `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: 第 ${frameIdx} 帧 res.write 抛错（res 已 destroy）→ SDK 仍在跑：${(writeErr as Error).message}`,
        );
      }
    }

    // 即使 res.end 过了，SDK 这里仍会跑完（信号没传，HTTP 请求没中断）
    try {
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ event: "usage", frameIdx, usage })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } catch {
      // ignore
    }

    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: SDK 跑完 | 耗时 ${(performance.now() - t0).toFixed(0)}ms | 共 ${frameIdx} 帧 | usage ${usage ? `${(usage as { total_tokens: number }).total_tokens} tokens` : "未拿到"}`,
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: ⚠️ 即使客户端 res.end()，SDK 已生成的 token 都计入 usage，钱照算`,
    );
  } catch (err: unknown) {
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort error:`,
      err,
    );
  }
}

server.listen(env.PORT, "127.0.0.1", () => {
  console.log(`──── AbortController 对照 Demo · 已启动 ────`);
  console.log(`  浏览器打开:  http://127.0.0.1:${env.PORT}/`);
  console.log(`  POST /api/full                 → 不取消，跑到底（对照基线）`);
  console.log(`  POST /api/cancel-after-frames  → 收 N 帧后 abort；body.abortAfterFrames 默认 5；浏览器点"立即取消"按钮也走这里`);
  console.log(`  POST /api/no-signal-abort      → 故意不传 signal；5s 后服务端 res.end() 关 SSE；观察 SDK 是否还跑、是否还计费`);
  console.log(`  模型: ${env.MINIMAX_MODEL}`);
  console.log(`  Ctrl+C 退出`);
});