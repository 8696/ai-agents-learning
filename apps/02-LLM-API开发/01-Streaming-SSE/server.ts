/**
 * 模块 02 · Streaming / SSE · Demo（koa + §5.3 HTML 内联 React）
 *
 * 职责：起一个 koa HTTP server，暴露三条接口 + 静态页。
 *   - GET  /              public/index.html（Tailwind + React UMD + Babel Standalone）
 *   - GET  /health        { ok, port }
 *   - GET  /api/stream    text/event-stream：每 TOKEN_INTERVAL_MS 推一帧 SSE（模拟 LLM）
 *   - GET  /api/blocking  text/plain：攒齐后一次性返回（总耗时与流式相同）
 *   - GET  /api/real      text/event-stream：真正调用线上模型，原样转发 OpenAI chunk
 *
 * 数据流：
 *   浏览器 fetch('/api/stream') → ctx.res.write('data: ...\n\n') → getReader() → 切帧 + 累加
 *   浏览器 fetch('/api/blocking') → setTimeout 攒齐 → text
 *   浏览器 fetch('/api/real') → OpenAI SDK stream:true → ctx.res.write 转发
 *
 * 为什么：本条要能讲清「帧大概长什么样 + 流式 vs 一次性 + token/frame/content 三层解耦」。
 *
 * 入口：yarn app:02-01-streaming-sse → tsx server.ts（无 index.ts）
 *
 * 概念 / 取舍 / 踩坑：docs/学习模块/02-LLM-API开发/01-Streaming-SSE.md
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "../../load-root-env.js";

loadRootEnv();

// ── 1) 环境变量（模拟接口不强制 Key；/api/real 才需要）──
const envSchema = z.object({
  MINIMAX_API_KEY: z.string().min(1).optional(),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  PORT: z.coerce.number().int().positive().default(50201),
});
const env = envSchema.parse(process.env);

// ── 2) 模拟 LLM 的 token 序列 ──
const TOKENS = ["你", "好", "，", "我", "是", " ", "AI", " ", "助", "手", "。"];
const TOKEN_INTERVAL_MS = 200;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

// ── 3) koa ──
const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    port: env.PORT,
    model: env.MINIMAX_MODEL,
    hasKey: Boolean(env.MINIMAX_API_KEY),
  };
});

// ── 模拟 SSE：每 TOKEN_INTERVAL_MS 推一帧 ──
router.get("/api/stream", async (ctx: Context, _next: Next) => {
  ctx.respond = false;
  ctx.res.writeHead(200, SSE_HEADERS);
  let i = 0;
  const tick = () => {
    if (i >= TOKENS.length) {
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] SSE 帧 #${i + 1}: data: [DONE]    ← 结束帧，连接关闭`,
      );
      ctx.res.write("data: [DONE]\n\n");
      ctx.res.end();
      return;
    }
    const payload = JSON.stringify({
      choices: [{ delta: { content: TOKENS[i] } }],
    });
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] SSE 帧 #${i + 1}: data: ${payload}`,
    );
    ctx.res.write(`data: ${payload}\n\n`);
    i += 1;
    setTimeout(tick, TOKEN_INTERVAL_MS);
  };
  tick();
});

// ── 一次性：攒齐再返（总耗时与流式相同）──
router.get("/api/blocking", async (ctx: Context, _next: Next) => {
  await new Promise((resolve) => {
    setTimeout(resolve, TOKENS.length * TOKEN_INTERVAL_MS);
  });
  ctx.type = "text/plain; charset=utf-8";
  ctx.body = TOKENS.join("");
});

// ── 真实 LLM：原样转发 OpenAI chunk ──
router.get("/api/real", async (ctx: Context, _next: Next) => {
  ctx.respond = false;
  if (!env.MINIMAX_API_KEY) {
    ctx.res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    ctx.res.end(
      JSON.stringify({
        error:
          "MINIMAX_API_KEY 未配置。在 apps/.env 填一个 MiniMax / 智谱 / OpenAI Key 即可（Key 兼容 OpenAI 协议即可）。",
      }),
    );
    return;
  }

  const client = new OpenAI({
    apiKey: env.MINIMAX_API_KEY,
    baseURL: env.MINIMAX_BASE_URL,
  });
  const t0 = performance.now();
  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/real: 开始调用 ${env.MINIMAX_MODEL}（baseURL=${env.MINIMAX_BASE_URL}）`,
  );

  ctx.res.writeHead(200, SSE_HEADERS);

  try {
    const stream = await client.chat.completions.create({
      model: env.MINIMAX_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "user", content: "用一句话介绍你自己，30 字以内。" }],
    });

    let frameIdx = 0;
    for await (const chunk of stream) {
      frameIdx += 1;
      // SDK 返回 zod 类实例；plain 化后 JSON.stringify 才能带出完整字段
      const plain = JSON.parse(JSON.stringify(chunk));
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/real 真实 chunk #${frameIdx}: ${JSON.stringify(plain)}`,
      );
      ctx.res.write(`data: ${JSON.stringify(plain)}\n\n`);
    }
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/real: 完成，共 ${frameIdx} 帧`,
    );
    ctx.res.write("data: [DONE]\n\n");
    ctx.res.end();
  } catch (err: unknown) {
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/real error:`,
      err,
    );
    const msg = err instanceof Error ? err.message : String(err);
    if (!ctx.res.headersSent) {
      ctx.res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      ctx.res.end(JSON.stringify({ error: msg }));
      return;
    }
    ctx.res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    ctx.res.end();
  }
});

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(env.PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 02 · 01 Streaming / SSE Demo（§5.3 React + koa · HTML 内联块）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${env.PORT}/`);
  console.log(`  GET  /api/stream    → 模拟 SSE（每 200ms 一帧）`);
  console.log(`  GET  /api/blocking  → 一次性（攒齐 2.2s）`);
  console.log(`  GET  /api/real      → 真实 LLM 流式（需 Key）`);
  console.log(`  GET  /health        → 环境信息`);
  console.log(`  Ctrl+C 退出`);
});
