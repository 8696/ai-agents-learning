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
import { z } from "zod";
import { getLlm, logLlmConfig } from "../../llm.js";

const llm = getLlm();
const client = llm.openai;
const PORT = z.coerce.number().int().positive().default(50000).parse(process.env.PORT);

const bodySchema = z.object({
  message: z.string().min(1, "message 不能为空"),
});

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    model: llm.modelA,
    provider: llm.provider,
    baseURL: llm.baseUrlA,
    port: PORT,
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
      model: llm.modelA,
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

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 00 环境准备 · HTTP + SSE（§5.3 React + koa）────");
  console.log(`  浏览器打开: http://127.0.0.1:${PORT}/`);
  console.log(`  POST /api/chat  Body: { "message": "你好" }`);
  console.log(`  GET  /health`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
