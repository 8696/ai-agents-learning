/**
 * 模块 02 · Streaming / SSE · 最小 Demo（前后端分离版）
 *
 * 职责：起一个 HTTP server，暴露三条接口 + 一个静态页面。
 *   - GET /                返回 public/index.html（浏览器页面）
 *   - GET /api/stream      text/event-stream：每 TOKEN_INTERVAL_MS 推一帧 SSE（模拟 LLM）
 *   - GET /api/blocking    text/plain：攒齐后一次性返回（总耗时与流式相同）
 *   - GET /api/real        text/event-stream：真正调用线上 MiniMax / 智谱 / OpenAI 模型，
 *                          后端日志同步打印每帧 OpenAI 原始 chunk，
 *                          前端能看到真实 LLM 的 batching 行为（一般 1 帧含多 token）
 *
 * 为什么：本条要能讲清「帧大概长什么样 + 流式 vs 一次性 + token/frame/content 三层解耦」。
 * 加 /api/real 是为了**对照**——模拟版每帧 1 字符，真实版每帧可能含多字符，
 * 让 token ≠ frame ≠ content 长度 这个易混点直接被肉眼看见。
 *
 * 数据流：
 *   浏览器 fetch('/api/stream') ──> 后端 res.write('data: ...\n\n') ──> SSE 帧 ──> getReader() ──> 切帧 + 累加 ──> DOM
 *   浏览器 fetch('/api/blocking') ──> 后端 setTimeout 攒齐 ──> text ──> res.text() ──> DOM
 *   浏览器 fetch('/api/real') ──> OpenAI SDK stream:true ──> 真实 chunk ──> 后端 res.write 转发 ──> SSE 帧 ──> getReader() ──> 切帧 + 累加 ──> DOM
 *
 * 不调云端 API（/api/stream + /api/blocking），纯 Node 22 就能跑；
 * /api/real 需要 apps/.env 里有 MINIMAX_API_KEY（或兼容的 OpenAI Key）。
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { loadRootEnv } from "../../load-root-env.js";

loadRootEnv(); // 从 apps/.env 读 MINIMAX_API_KEY / MINIMAX_BASE_URL / MINIMAX_MODEL

// ── 模拟 LLM 要生成的 token 序列 ────────────────────────────────
const TOKENS = ["你", "好", "，", "我", "是", " ", "AI", " ", "助", "手", "。"];
const TOKEN_INTERVAL_MS = 200;
const PORT = 5173;

// ── 启动时一次性把 HTML 读进内存（小 demo，没必要走流式 fs） ──
const html = readFileSync(
  fileURLToPath(new URL("./public/index.html", import.meta.url)),
  "utf-8",
);

const server = createServer((req, res) => {
  // ── 1) 静态页：返回浏览器前端 ──
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // ── 2) SSE：每 TOKEN_INTERVAL_MS 推一帧（模拟 LLM） ──
  if (req.url === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    let i = 0;
    const tick = () => {
      if (i >= TOKENS.length) {
        // 后端日志：让学习者肉眼看见结束帧
        console.log(
          `[${(performance.now() / 1000).toFixed(2)}s] SSE 帧 #${i + 1}: data: [DONE]    ← 结束帧，连接关闭`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      const payload = JSON.stringify({
        choices: [{ delta: { content: TOKENS[i] } }],
      });
      // 后端日志：让学习者肉眼看见一帧长什么样
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] SSE 帧 #${i + 1}: data: ${payload}`,
      );
      res.write(`data: ${payload}\n\n`);
      i += 1;
      setTimeout(tick, TOKEN_INTERVAL_MS);
    };
    tick();
    return;
  }

  // ── 3) 一次性：攒齐再返（总耗时与流式相同） ──
  if (req.url === "/api/blocking") {
    setTimeout(() => {
      const answer = TOKENS.join("");
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": Buffer.byteLength(answer),
      });
      res.end(answer);
    }, TOKENS.length * TOKEN_INTERVAL_MS);
    return;
  }

  // ── 4) 真实 LLM：用 OpenAI SDK 流式调线上模型 ──
  if (req.url === "/api/real") {
    const apiKey = process.env.MINIMAX_API_KEY;
    const baseURL = process.env.MINIMAX_BASE_URL;
    const model = process.env.MINIMAX_MODEL ?? "MiniMax-M3";
    if (!apiKey) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            "MINIMAX_API_KEY 未配置。在 apps/.env 填一个 MiniMax / 智谱 / OpenAI Key 即可（Key 兼容 OpenAI 协议即可）。",
        }),
      );
      return;
    }
    const client = new OpenAI({ apiKey, baseURL });
    const t0 = performance.now();
    console.log(
      `\n[${(t0 / 1000).toFixed(2)}s] /api/real: 开始调用 ${model}（baseURL=${baseURL}）`,
    );

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    (async () => {
      try {
        const stream = await client.chat.completions.create({
          model,
          stream: true,
          // 让 usage 在最后一帧返回（OpenAI 兼容接口通常支持；部分国产厂商可能忽略）
          stream_options: { include_usage: true },
          messages: [
            { role: "user", content: "用一句话介绍你自己，30 字以内。" },
          ],
        });

        let frameIdx = 0;
        for await (const chunk of stream) {
          frameIdx += 1;
          // SDK 返回的是 zod 类实例（ChatCompletionChunk），不是 plain object。
          // JSON.parse(JSON.stringify(...)) 把 zod 实例彻底 plain 化，
          //   这样 JSON.stringify 才能正确输出完整字段（含 id/object/model/created/
          //   choices/usage/service_tier/base_resp 等）。
          //   直接 JSON.stringify(chunk) 可能输出 {} —— zod 实例的属性不通过 enumerable 暴露。
          const plain = JSON.parse(JSON.stringify(chunk));
          // 后端日志：让学习者肉眼看见 OpenAI 真实 chunk 的完整 JSON 结构
          console.log(
            `[${(performance.now() / 1000).toFixed(2)}s] /api/real 真实 chunk #${frameIdx}: ${JSON.stringify(plain)}`,
          );
          // 原样转发给前端：不做任何字段提取 / 包层，
          //   前端拿到的是 OpenAI 原始 chunk JSON（与 SDK 内部解析后字段一致）
          res.write(`data: ${JSON.stringify(plain)}\n\n`);
        }
        console.log(
          `[${(performance.now() / 1000).toFixed(2)}s] /api/real: 完成，共 ${frameIdx} 帧`,
        );
        res.write(`data: [DONE]\n\n`);
        res.end();
      } catch (err: unknown) {
        console.error(
          `[${(performance.now() / 1000).toFixed(2)}s] /api/real error:`,
          err,
        );
        const msg = err instanceof Error ? err.message : String(err);
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.end();
      }
    })();
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n──── Streaming / SSE Demo · 已启动 ────`);
  console.log(`  浏览器打开：http://127.0.0.1:${PORT}/`);
  console.log(`  点页面里的「流式」「一次性」按钮，对照 TTFT`);
  console.log(`  点「真实模型」按钮，调线上 MiniMax / 智谱 / OpenAI，看真实 batching`);
  console.log(`  后端控制台会同步打印每一帧 SSE 原文（含真实 chunk 全文）`);
  console.log(`  Ctrl+C 退出\n`);
});