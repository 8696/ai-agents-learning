/**
 * 模块 00 · mini-app HTTP + SSE（§5.3 koa + HTML 内联 React）
 *
 * 职责：最小浏览器聊天入口。
 *   GET  /            public/index.html
 *   GET  /health      { ok, model, port }
 *   POST /api/chat    协议 A 流式，原样转发 OpenAI chunk 为 SSE 帧
 *
 * 进阶能力（取消、限流、协议对照）在 apps/02-LLM-API开发/ 对应小节，不塞进本入口。
 *
 * 入口：yarn app:00-01-mini-server → tsx server.ts
 * CLI 仍在 src/index.ts / src/index-anthropic.ts。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "../../load-root-env.js";

loadRootEnv();

const envSchema = z.object({
  MINIMAX_API_KEY: z
    .string()
    .min(1, "请在 apps/.env 中设置 MINIMAX_API_KEY（见 apps/.env.example）"),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  // §5.3.3 PORT = 5{MM}{SS}；mini-app 用 50000
  PORT: z.coerce.number().int().positive().default(50000),
});
const env = envSchema.parse(process.env);

const bodySchema = z.object({
  message: z.string().min(1, "message 不能为空"),
});

const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    model: env.MINIMAX_MODEL,
    baseURL: env.MINIMAX_BASE_URL,
    port: env.PORT,
    endpoint: "POST /api/chat (SSE)",
  };
});

router.post("/api/chat", async (ctx: Context, _next: Next) => {
  ctx.respond = false;
  const parsed = bodySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.res.writeHead(400, { "Content-Type": "application/json" });
    ctx.res.end(
      JSON.stringify({ error: `请求体不合法: ${parsed.error.message}` }),
    );
    return;
  }

  ctx.res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const stream = await client.chat.completions.create({
      model: env.MINIMAX_MODEL,
      messages: [{ role: "user", content: parsed.data.message }],
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const plain = JSON.parse(JSON.stringify(chunk));
      try {
        ctx.res.write(`data: ${JSON.stringify(plain)}\n\n`);
      } catch {
        break;
      }
    }

    try {
      ctx.res.write("data: [DONE]\n\n");
      ctx.res.end();
    } catch {
      /* ignore */
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      ctx.res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      ctx.res.end();
    } catch {
      /* ignore */
    }
  }
});

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(env.PORT, "127.0.0.1", () => {
  console.log("──── 00 环境准备 · HTTP + SSE（§5.3 React + koa）────");
  console.log(`  浏览器打开: http://127.0.0.1:${env.PORT}/`);
  console.log(`  POST /api/chat  Body: { "message": "你好" }`);
  console.log(`  GET  /health`);
  console.log(`  模型: ${env.MINIMAX_MODEL} (${env.MINIMAX_BASE_URL})`);
  console.log(`  Ctrl+C 退出`);
});
