/**
 * 模块 02 · AbortController · 对照 Demo（§5.3 React + koa · HTML 内联块）
 *
 * 职责：起一个 koa server，暴露 5 个端点 + 浏览器页面（HTML 内联 React + Babel Standalone），
 *       让学习者肉眼对比：
 *         1. /api/full                 — 不取消，跑到底（对照基线）
 *         2. /api/cancel-after-frames  — 客户端先收 N 帧就 abort（让学习者按"按到哪帧就停"做对照）
 *         3. /api/no-signal-abort      — 故意不传 signal，模拟"忘了传 signal"：abort 不生效，看服务端是否跑完
 *
 * 浏览器页面（GET /）：
 *   - 三个按钮对应三个端点
 *   - 逐帧渲染 + 显示累计耗时 + 是否拿到 usage + aborted 状态
 *
 * 数据流：
 *   浏览器 POST /api/full
 *     → koa router → ctx.request.body
 *     → openai SDK stream:true (无 signal)
 *     → 逐帧 SSE → for await delta.content → ctx.res.write
 *     → 完成 → usage 帧 → ctx.res.end
 *   浏览器 POST /api/cancel-after-frames
 *     → koa router → ctx.request.body
 *     → openai SDK stream:true (signal: controller.signal)
 *     → 收 N 帧后 controller.abort()（或者页面点"立即取消"按钮 / 客户端断开也走这里）
 *     → for await 抛 AbortError → catch 里发"aborted"帧 → ctx.res.end
 *   浏览器 POST /api/no-signal-abort
 *     → koa router → ctx.request.body
 *     → 故意不传 signal → 模拟用户按 Ctrl+C
 *     → 服务端继续跑完（abort 无效）→ 看是否拿到 usage
 *
 * 为什么：必须真按一次"取消"按钮，看到「客户端停了、服务端在 catch 里收到 AbortError 停了，
 * 帧数明显少于 full 端点」才能把"客户端停 ≠ 服务端停"+"abort 是关 socket 不是停生成"+"已生成的 token 算钱"讲清。
 *
 * §5.3 完整版（2026-09-02 维护模式拆分）：
 *     - 业务逻辑整体从旧 server.ts（createServer 版）搬过来，handleFull / handleCancelAfterFrames / handleNoSignalAbort 一字不改
 *     - HTTP 框架从 node:http 换到 koa（@koa/router + koa-static + @koa/bodyparser）
 *     - 浏览器页面从 vanilla DOM 换成 React 18.3.1 UMD + Babel Standalone 7.26.4（HTML 内联 JSX 块）
 *     - 入口层（index.ts）已删除，yarn app:02-03-abort-controller 直接 tsx server.ts
 *     - PORT 默认 50203（§5.3.3 `5{MM}{SS}`）
 *
 * 概念/取舍/踩坑：docs/学习模块/02-LLM-API开发/03-AbortController.md
 *
 * 跑前需要：apps/.env 里填 MINIMAX_API_KEY（模块 00 已有）。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import type { IncomingMessage, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "../../load-root-env.js";

loadRootEnv();

// ── 1) 环境变量校验 ──
const envSchema = z.object({
  MINIMAX_API_KEY: z.string().min(1, "请在 apps/.env 填 MINIMAX_API_KEY"),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  PORT: z.coerce.number().int().positive().default(50203),
});
const env = envSchema.parse(process.env);

const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

// ── 2) 请求体校验 ──
const bodySchema = z.object({
  message: z.string().min(1).default("用 200 字介绍一下你自己"),
  abortAfterFrames: z.number().int().positive().max(200).default(5),
});
type Body = z.infer<typeof bodySchema>;

// ── 3) koa + router + bodyparser + static ──
const app = new Koa();
const router = new Router();

// 3.1) bodyparser（§5.3.5 显式声明 body 解析；bodyParser 必须在 router 之前）
app.use(bodyParser());

// 3.2) GET /health —— 普通 JSON 端点，koa 自动 ctx.body = JSON
router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    model: env.MINIMAX_MODEL,
    port: env.PORT,
    endpoints: [
      "POST /api/full",
      "POST /api/cancel-after-frames",
      "POST /api/no-signal-abort",
    ],
  };
});

// 3.3) SSE 端点：ctx.respond = false 让 koa 别接管 response；handler 直接用 ctx.res.write / ctx.res.end
//      ctx.request.body 已由 bodyParser 解析；ctx.req / ctx.res 是 node 原生 IncomingMessage / ServerResponse
router.post("/api/full", async (ctx: Context, _next: Next) => {
  ctx.respond = false;
  const body = ctx.request.body as Body;
  await handleFull(body, ctx.res);
});

router.post("/api/cancel-after-frames", async (ctx: Context, _next: Next) => {
  ctx.respond = false;
  const body = ctx.request.body as Body;
  await handleCancelAfterFrames(body, ctx.req, ctx.res);
});

router.post("/api/no-signal-abort", async (ctx: Context, _next: Next) => {
  ctx.respond = false;
  const body = ctx.request.body as Body;
  await handleNoSignalAbort(body, ctx.res);
});

app.use(router.routes()).use(router.allowedMethods());

// 3.4) 静态资源（public/index.html）—— React 代码已在 HTML 内联
//   § 关键：serve 第一个参数必须绝对路径；相对路径是相对 process.cwd()，不可靠
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

// ── 4) 业务 handler（一字不改从旧 server.ts 搬；只换 HTTP 框架，签名 / 行为保持一致） ──

// ── 4.1) /api/full：不取消，跑到底 ──
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

// ── 4.2) /api/cancel-after-frames：服务端收 N 帧后自动 abort；客户端断连也 abort ──
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

  const controller = new AbortController();

  const targetFrames = body.abortAfterFrames;

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

      if (frameIdx >= targetFrames && !aborted) {
        aborted = true;
        abortReason = "frames";
        console.log(
          `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: 已收 ${frameIdx} 帧 → controller.abort()（abortAfterFrames=${targetFrames}）`,
        );
        controller.abort();
      }
    }

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

// ── 4.3) /api/no-signal-abort：故意不传 signal，对照"忘了传 signal 会怎样" ──
async function handleNoSignalAbort(
  body: Body,
  res: ServerResponse,
): Promise<void> {
  const t0 = performance.now();
  let frameIdx = 0;
  let usage: unknown = null;

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

// ── 5) 启动 ──
app.listen(env.PORT, "127.0.0.1", () => {
  console.log(`──── AbortController 对照 Demo（§5.3 React + koa · HTML 内联块） · 已启动 ────`);
  console.log(`  浏览器打开:  http://127.0.0.1:${env.PORT}/`);
  console.log(`  GET  /                          → public/index.html（React + Babel Standalone 内联块）`);
  console.log(`  GET  /health                    → { ok, model, port, endpoints }`);
  console.log(`  POST /api/full                  → 不取消，跑到底（对照基线）`);
  console.log(`  POST /api/cancel-after-frames   → 收 N 帧后 abort；body.abortAfterFrames 默认 5；浏览器点"立即取消"按钮 / pagehide 都走这里`);
  console.log(`  POST /api/no-signal-abort       → 故意不传 signal；5s 后服务端 res.end() 关 SSE；观察 SDK 是否还跑、是否还计费`);
  console.log(`  模型: ${env.MINIMAX_MODEL}`);
  console.log(`  Ctrl+C 退出`);
});
