/**
 * 模块 02 · Streaming / SSE · HTTP + SSE 服务端
 *
 * 职责：起一个最小 HTTP server，对外暴露 POST /api/chat，
 *       调用协议 A（MiniMax / OpenAI 兼容），把模型 chunk 以 SSE 帧原样转发给前端。
 *       CLI 入口 src/index.ts 保留不动。
 *
 * 数据流：
 *   前端 fetch('/api/chat', { method: 'POST', body: JSON.stringify({ message }) })
 *     → Node http.createServer 收 body
 *     → Zod 校验请求体
 *     → OpenAI SDK chat.completions.create(stream: true, options: { signal })
 *     → 收到第一个 chunk 后 setTimeout 3 秒 → controller.abort()（模拟用户读了会儿中途取消）
 *     → for await chunk → JSON.parse(JSON.stringify(chunk)) 去掉 zod 类外壳
 *                       → res.write(`data: ${JSON.stringify(plain)}\n\n`)
 *     → 结束帧 res.write("data: [DONE]\n\n") → res.end()
 *     → catch AbortError → 发 {event:"aborted"} 帧 → res.end()
 *
 * 与 demos/02-LLM-API开发/01-Streaming-SSE/index.ts 的区别：
 *   - 这是项目版本：Zod 校验环境与请求体，错误处理，无教学注释。
 *   - demos 是教学版：带控制台逐帧日志、模拟版 + 真实版两个端点、含完整浏览器前端。
 *   概念/取舍/踩坑写在 docs/学习模块/02-LLM-API开发/01-Streaming-SSE.md，
 *   本文件不重复。
 *
 * 对应路径：apps/01-chatgpt-mini/src/server.ts
 *
 * 已回填：
 *   - 模块 02 · 03-AbortController：第一个 chunk 到 → setTimeout 3 秒 → controller.abort()
 *     → signal 传 SDK → catch AbortError → 发 {event:"aborted"} 帧 → res.end()（非错误结束）；
 *     详见 [03-AbortController 小节 MD](../../docs/学习模块/02-LLM-API开发/03-AbortController.md)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { z } from "zod";
import { loadRootEnv } from "./load-root-env.js";

// ── 1. 加载环境变量（配置集中在 apps/，与 CLI 入口同源） ──
loadRootEnv();

// ── 2. 环境变量校验（启动期拦住空 Key；与 src/index.ts 同模式） ──
const envSchema = z.object({
  MINIMAX_API_KEY: z
    .string()
    .min(1, "请在 apps/.env 中设置 MINIMAX_API_KEY（见 apps/.env.example）"),
  MINIMAX_BASE_URL: z
    .string()
    .url()
    .default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  // 服务端端口；本仓库默认 3000，方便与 demos 的 5173 区分
  PORT: z.coerce.number().int().positive().default(3000),
});

const env = envSchema.parse(process.env);

// ── 3. 请求体校验：前端 POST { message: string } ──
// 学习阶段只支持单轮 user 输入；多轮与 system 在模块 03 / 06 加进来
const bodySchema = z.object({
  message: z.string().min(1, "message 不能为空"),
});

// ── 4. OpenAI 客户端（与 src/index.ts 共用同一 Key / baseURL） ──
const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

// ── 5. HTTP server 路由分发 ──
const server = createServer(async (req, res) => {
  // CORS 预检：让浏览器从任意端口调本 API（学习阶段不锁源）
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // 静态页：GET / → public/index.html（最小 SSE 聊天 UI，浏览器直接打开就能玩）
  if (req.method === "GET" && req.url === "/") {
    try {
      const html = readFileSync(
        fileURLToPath(new URL("../public/index.html", import.meta.url)),
        "utf-8",
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`public/index.html 缺失: ${msg}`);
    }
    return;
  }

  // 健康检查：GET /health → 返回当前模型与端点
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        model: env.MINIMAX_MODEL,
        baseURL: env.MINIMAX_BASE_URL,
        endpoint: "POST /api/chat (SSE)",
      }),
    );
    return;
  }

  // 流式聊天：POST /api/chat → text/event-stream
  if (req.method === "POST" && req.url === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // 5.1 读完整 body（POST 体可能跨多个 TCP 包到达，必须累加）
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");

  // 5.2 解析 + 校验；失败立刻 400，不进 LLM 调用（避免空请求扣钱）
  let parsed: { message: string };
  try {
    const json: unknown = JSON.parse(raw);
    parsed = bodySchema.parse(json);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `请求体不合法: ${msg}` }));
    return;
  }

  // 5.3 写 SSE 响应头（CORS 让前端跨域能调；Connection: keep-alive 防止中间网关掐连接）
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // 模块 02 · 03-AbortController：收到第一个 chunk 后 3 秒自动 abort，模拟用户读了会儿中途取消。
  // signal 在 SDK 第二个参数（options）里传，不在 body 里
  const controller = new AbortController();
  let abortTimer: NodeJS.Timeout | null = null;
  let firstChunkAt: number | null = null;

  try {
    const stream = await client.chat.completions.create(
      {
        model: env.MINIMAX_MODEL,
        messages: [{ role: "user", content: parsed.message }],
        stream: true,
        // OpenAI 兼容：让 usage 在最后一帧返回；部分国产厂商会忽略
        stream_options: { include_usage: true },
      },
      { signal: controller.signal },
    );

    // 5.4 逐 chunk 原样转发为 SSE 帧
    // SDK 返回的 ChatCompletionChunk 是 zod 类实例（不是 plain object）；
    // 直接 JSON.stringify(chunk) 会输出 {} —— zod 实例的属性不通过 enumerable 暴露。
    // JSON.parse(JSON.stringify(...)) 把它彻底 plain 化，
    // 这样前端拿到的就是 SDK 解析后的同一份完整 JSON（choices / usage / service_tier ...）。
    for await (const chunk of stream) {
      // 第一个 chunk 到的时间点 = 开始生成；启动 3 秒定时器（模拟用户读了会儿中途取消）
      if (firstChunkAt === null) {
        firstChunkAt = Date.now();
        abortTimer = setTimeout(() => {
          console.log(`[${new Date().toISOString()}] 3 秒到 → 模拟用户中途取消 → controller.abort()`);
          controller.abort();
        }, 3000);
      }

      const plain = JSON.parse(JSON.stringify(chunk));
      try {
        res.write(`data: ${JSON.stringify(plain)}\n\n`);
      } catch (writeErr: unknown) {
        // res 可能已 destroy（客户端断开后 write 抛 ERR_STREAM_DESTROYED）
        break;
      }
    }

    // 流正常跑完 → 清掉定时器（不会触发，但保险）
    if (abortTimer) clearTimeout(abortTimer);

    // 5.5 结束帧：约定俗成 data: [DONE]\n\n（OpenAI / Anthropic 都遵循）
    try {
      res.write("data: [DONE]\n\n");
      res.end();
    } catch {
      // ignore
    }
  } catch (err: unknown) {
    // AbortError / APIUserAbortError：3 秒到 → 模拟用户中途取消
    // 不是失败 —— 给前端发一帧 aborted 事件让 UI 知道，别发 error 帧
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.constructor.name === "APIUserAbortError")
    ) {
      if (abortTimer) clearTimeout(abortTimer);
      try {
        res.write(
          `data: ${JSON.stringify({ event: "aborted", reason: "simulated-user-cancel-3s" })}\n\n`,
        );
        res.end();
      } catch {
        // res 可能已 destroy，不再写
      }
      return;
    }
    // 普通错误（流已开了 200，不能再 writeHead；只能写一帧 error 让前端识别）
    const msg = err instanceof Error ? err.message : String(err);
    try {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    } catch {
      // ignore
    }
  }
}

server.listen(env.PORT, "127.0.0.1", () => {
  console.log(`──── 01 ChatGPT Mini · HTTP + SSE Server ────`);
  console.log(`  浏览器打开: http://127.0.0.1:${env.PORT}/`);
  console.log(`  POST 端点:  http://127.0.0.1:${env.PORT}/api/chat`);
  console.log(`  Body:      { "message": "你好" }`);
  console.log(`  健康检查:   http://127.0.0.1:${env.PORT}/health`);
  console.log(`  模型:      ${env.MINIMAX_MODEL} (${env.MINIMAX_BASE_URL})`);
  console.log(`  Ctrl+C 退出`);
});
