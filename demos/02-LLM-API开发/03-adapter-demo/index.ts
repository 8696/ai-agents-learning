/**
 * Demo · Adapter 层 HTTP server
 *
 * 业务代码完全不碰 SDK——只调 sendMessage(opts)，由 adapter 决定走哪个协议。
 *
 * 端点：
 *   GET  /            静态 HTML 页（4 控件 + 显示区）
 *   GET  /health      adapter 状态
 *   POST /api/chat    一次调 adapter.sendMessage，返回统一格式
 *
 * body: { message, protocol: "A"|"B", system?, thinking_budget? }
 *   - protocol: 必填，路由到哪个 SDK
 *   - system: 可选
 *   - thinking_budget: 可选；传了就启用 extended thinking（仅 B 端点生效；A 端点总是有 thinking 但不算 thinking_budget）
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  sendMessage,
  sendMessageStream,
  type Protocol,
} from "./adapter.js";

// ── 请求体校验 ──
const bodySchema = z.object({
  message: z.string().min(1, "message 不能为空"),
  protocol: z.enum(["A", "B"]),
  system: z.string().optional(),
  thinking_budget: z.number().int().positive().optional(),
});

// ── 静态 HTML（启动时读一次） ──
const html = readFileSync(
  fileURLToPath(new URL("./public/index.html", import.meta.url)),
  "utf-8",
);

// ── HTTP server ──
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
    res.end(JSON.stringify({ ok: true, endpoints: ["POST /api/chat"] }));
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf-8");

    let body: z.infer<typeof bodySchema>;
    try {
      const json: unknown = JSON.parse(raw);
      body = bodySchema.parse(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `请求体不合法: ${msg}` }));
      return;
    }

    // ── 业务代码：只调 adapter，不碰 SDK ──
    try {
      const opts = {
        protocol: body.protocol as Protocol,
        message: body.message,
        system: body.system,
        ...(body.thinking_budget !== undefined
          ? {
              thinking: {
                type: "enabled" as const,
                budget_tokens: body.thinking_budget,
              },
            }
          : {}),
      };
      const unified = await sendMessage(opts);

      // adapter 返回的统一格式：content + thinking + usage + stopReason
      // 业务代码不用关心是 A 还是 B
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(unified, null, 2));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  // 流式版本：调 adapter.sendMessageStream，async generator → SSE 帧
  // 业务代码 for await (const delta of sendMessageStream(opts)) 一行就行
  if (req.method === "POST" && req.url === "/api/chat-stream") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf-8");

    let body: z.infer<typeof bodySchema>;
    try {
      const json: unknown = JSON.parse(raw);
      body = bodySchema.parse(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `请求体不合法: ${msg}` }));
      return;
    }

    const opts = {
      protocol: body.protocol as Protocol,
      message: body.message,
      system: body.system,
      ...(body.thinking_budget !== undefined
        ? {
            thinking: {
              type: "enabled" as const,
              budget_tokens: body.thinking_budget,
            },
          }
        : {}),
    };

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    try {
      // 业务代码：一行 for await；不知道也不需要知道是 A 还是 B
      for await (const delta of sendMessageStream(opts)) {
        res.write(`data: ${JSON.stringify(delta)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.write(`data: ${JSON.stringify({ type: "_error", error: msg })}\n\n`);
      res.end();
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

const PORT = Number(process.env.PORT) || 5175;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`──── Adapter Demo · 已启动 ────`);
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  POST /api/chat        body: { message, protocol: "A"|"B", system?, thinking_budget? }`);
  console.log(`                          → 返回统一 UnifiedResponse JSON`);
  console.log(`  POST /api/chat-stream  body: 同上`);
  console.log(`                          → 返回 SSE 流（data: UnifiedDelta\\n\\n · 末帧 [DONE]）`);
  console.log(`  业务代码只调 sendMessage / sendMessageStream，不碰 SDK`);
  console.log(`  Ctrl+C 退出`);
});
