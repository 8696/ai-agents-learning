/**
 * 模块 02 · 协议 A vs B · 对照 Demo（用真实线上对话）
 *
 * 职责：起一个 koa HTTP server，暴露 9 个端点 + 静态 HTML，
 *       **同时调 MiniMax-M3 的协议 A 与协议 B**（同 Key，不同 baseURL），
 *       让学习者肉眼对比：
 *         - 入口方法 / SDK / 必填参数差异
 *         - 流式响应字段差异（A: delta.content 字符串；B: content_block_delta 事件）
 *         - 一次性响应字段差异（A: choices[0].message.content; B: content[0].text）
 *         - usage 字段命名差异（A: prompt/completion; B: input/output）
 *         - system 位置差异（A: messages[]; B: 顶层）
 *
 * 数据流：
 *   浏览器 POST /api/a   → openai SDK → MiniMax /v1        → 逐帧 data: {delta:"...",usage?:...}\n\n → res.end + [DONE]
 *   浏览器 POST /api/b   → Anthropic SDK → MiniMax /anthropic → 逐帧 data: {type:"content_block_delta",text:"..."}\n\n
 *                                            → 末帧 data: {type:"message_stop",usage,stop_reason}\n\n → res.end
 *   浏览器 POST /api/compare → 同时跑 A 和 B（一次性，非流式）→ JSON: { a: {...完整响应}, b: {...完整响应} }
 *
 * 为什么：协议 A vs B 的差异是「同一模型 + 不同 API 壳」，必须真的同 prompt 跑两边一次，
 * 看响应字段、流式帧结构、usage 命名，才能把 §6.2 那张速查表「对照观察到」。
 *
 * §5.3 完整版（2026-09-02 维护模式拆分）：
 *     - 框架从 node:http 切到 koa + @koa/router + koa-static + @koa/bodyparser
 *     - 业务逻辑整体从旧 server.ts 搬过来，一字不改（7 个 handler 全保留）
 *     - 端口：§5.3.3 `5{MM}{SS}` → 50202
 *     - static serve 走绝对路径（fileURLToPath）
 *     - 前端改为 HTML 内联 React + Babel Standalone 块（public/index.html）
 *
 * 概念/取舍/踩坑：docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md
 *
 * 跑前需要：apps/.env 里填 MINIMAX_API_KEY（模块 00 已有；同 Key 走 A / B 两个端点）。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { loadRootEnv } from "../../load-root-env.js";

loadRootEnv();

// ── 1) 环境变量校验 ──
const envSchema = z.object({
  MINIMAX_API_KEY: z
    .string()
    .min(1, "请在 apps/.env 填 MINIMAX_API_KEY"),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  MINIMAX_ANTHROPIC_BASE_URL: z
    .string()
    .url()
    .default("https://api.minimaxi.com/anthropic"),
  MINIMAX_ANTHROPIC_MODEL: z.string().default("MiniMax-M3"),
  // Messages API 必填 max_tokens；学习阶段给够
  MINIMAX_ANTHROPIC_MAX_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(1024),
  PORT: z.coerce.number().int().positive().default(50202),
});
const env = envSchema.parse(process.env);

// ── 2) 请求体校验 ──
const bodySchema = z.object({
  message: z.string().min(1),
  // 可选 system prompt；两协议都填时才能对照「同一 system 走两条路」
  system: z.string().optional(),
  // 流式 + thinking 端点的预算（仅 /api/b-thinking-stream 用）
  thinking_budget: z.number().int().positive().optional(),
});
type Body = z.infer<typeof bodySchema>;

function parseBody(ctx: Context): Body {
  const parsed = bodySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    const err: Error & { status?: number } = new Error(
      `请求体不合法: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
    err.status = 400;
    throw err;
  }
  return parsed.data;
}

// ── 3) 两个客户端 ──
// 同一把 Key，只换 baseURL —— 这是「同 Key 换协议」的最直接对照
const aClient = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});
const bClient = new Anthropic({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_ANTHROPIC_BASE_URL,
});

// ── 4) koa 框架 ──
const app = new Koa();
const router = new Router();

// 4.1) bodyparser（§5.3.5 显式声明 body 解析）
app.use(bodyParser());

// ── 5) 路由 ──
// 9 个端点：1×静态 + 1×health + 7×业务 handler

// 5.1) GET /health
router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    a: { baseURL: env.MINIMAX_BASE_URL, model: env.MINIMAX_MODEL },
    b: {
      baseURL: env.MINIMAX_ANTHROPIC_BASE_URL,
      model: env.MINIMAX_ANTHROPIC_MODEL,
      maxTokens: env.MINIMAX_ANTHROPIC_MAX_TOKENS,
    },
  };
});

// 5.2) POST /api/a —— 协议 A 流式
router.post("/api/a", async (ctx: Context, _next: Next) => {
  try {
    const body = parseBody(ctx);
    ctx.respond = true; // koa 默认就开始 res 写操作；保留传统流式即可
    // handleA 需要直接写 res，让 ctx.res 流式输出
    await handleA(body, ctx.res);
  } catch (err: unknown) {
    if (ctx.res.headersSent) return;
    const msg = err instanceof Error ? err.message : String(err);
    ctx.status = err instanceof Error && (err as { status?: number }).status === 400 ? 400 : 500;
    ctx.body = { error: msg };
  }
});

// 5.3) POST /api/b —— 协议 B 流式
router.post("/api/b", async (ctx: Context, _next: Next) => {
  try {
    const body = parseBody(ctx);
    await handleB(body, ctx.res);
  } catch (err: unknown) {
    if (ctx.res.headersSent) return;
    const msg = err instanceof Error ? err.message : String(err);
    ctx.status = err instanceof Error && (err as { status?: number }).status === 400 ? 400 : 500;
    ctx.body = { error: msg };
  }
});

// 5.4) POST /api/compare —— 一次性对照（同时跑 A 和 B，非流式）
router.post("/api/compare", async (ctx: Context, _next: Next) => {
  try {
    const body = parseBody(ctx);
    const result = await handleCompare(body);
    ctx.status = 200;
    ctx.type = "application/json; charset=utf-8";
    ctx.body = JSON.stringify(result, null, 2);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.status = err instanceof Error && (err as { status?: number }).status === 400 ? 400 : 500;
    ctx.body = { error: msg };
  }
});

// 5.5) POST /api/think-compare
// 4 组场景（A 不带 / B 不带 / B 带 100 / B 带 500）
// 用于直观展示「协议 A 默认暴露 thinking / 协议 B 要主动启用 + usage 不分开计费」的差异
router.post("/api/think-compare", async (ctx: Context, _next: Next) => {
  try {
    const body = parseBody(ctx);
    const result = await handleThinkCompare(body);
    ctx.status = 200;
    ctx.type = "application/json; charset=utf-8";
    ctx.body = JSON.stringify(result, null, 2);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.status = err instanceof Error && (err as { status?: number }).status === 400 ? 400 : 500;
    ctx.body = { error: msg };
  }
});

// 5.6) POST /api/b-thinking-stream —— 协议 B 流式 + 启用 thinking：完整事件流
router.post("/api/b-thinking-stream", async (ctx: Context, _next: Next) => {
  try {
    const body = parseBody(ctx);
    await handleBThinkingStream(body, ctx.res);
  } catch (err: unknown) {
    if (ctx.res.headersSent) return;
    const msg = err instanceof Error ? err.message : String(err);
    ctx.status = err instanceof Error && (err as { status?: number }).status === 400 ? 400 : 500;
    ctx.body = { error: msg };
  }
});

// 5.7) POST /api/a-stream-raw
// 协议 A 流式（OpenAI chunk 原样转发 + meta frame，让前端逐帧分类展示）
// 与 /api/b-thinking-stream 形成完美对照：A 是「字符串帧流」、B 是「事件流」
router.post("/api/a-stream-raw", async (ctx: Context, _next: Next) => {
  try {
    const body = parseBody(ctx);
    await handleAStreamRaw(body, ctx.res);
  } catch (err: unknown) {
    if (ctx.res.headersSent) return;
    const msg = err instanceof Error ? err.message : String(err);
    ctx.status = err instanceof Error && (err as { status?: number }).status === 400 ? 400 : 500;
    ctx.body = { error: msg };
  }
});

// 5.8) POST /api/b-stream-raw
// 协议 B 流式（不启用 thinking，原样转发事件流）
// 与 /api/a-stream-raw 形成四向对照：A 有/无 thinking × B 有/无 thinking
router.post("/api/b-stream-raw", async (ctx: Context, _next: Next) => {
  try {
    const body = parseBody(ctx);
    await handleBStreamRaw(body, ctx.res);
  } catch (err: unknown) {
    if (ctx.res.headersSent) return;
    const msg = err instanceof Error ? err.message : String(err);
    ctx.status = err instanceof Error && (err as { status?: number }).status === 400 ? 400 : 500;
    ctx.body = { error: msg };
  }
});

app.use(router.routes()).use(router.allowedMethods());

// 5.9) 静态资源（public/index.html）
//   §5.3.4 强制：serve 第一个参数必须绝对路径；相对路径是相对 process.cwd()，不可靠
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

// ── 6) Handler 函数（一字不改从旧 server.ts 搬过来） ──

// 6.1) 协议 A 流式：openai SDK → SSE 帧
async function handleA(
  body: Body,
  res: import("node:http").ServerResponse,
): Promise<void> {
  // A: messages 里塞 system（与 B 顶层 system 位置对照）
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  messages.push({ role: "user", content: body.message });

  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/a: messages.length=${messages.length}`,
  );

  try {
    const stream = await aClient.chat.completions.create({
      model: env.MINIMAX_MODEL,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let frameIdx = 0;
    for await (const chunk of stream) {
      frameIdx += 1;
      // 把 zod 实例 plain 化（Streaming-SSE demo 实证：直接 JSON.stringify 会得 {}）
      const plain = JSON.parse(JSON.stringify(chunk));
      // 后端日志：让学习者肉眼看见 OpenAI 真实 chunk 结构
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/a 帧 #${frameIdx}: ${JSON.stringify(plain).slice(0, 200)}${plain.choices?.[0]?.delta?.content ? "..." : ""}`,
      );
      res.write(`data: ${JSON.stringify(plain)}\n\n`);
    }
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a: 完成，共 ${frameIdx} 帧`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${(performance.now() / 1000).toFixed(2)}s] /api/a error:`, err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  }
}

// 6.2) 协议 B 流式：@anthropic-ai/sdk → SSE 帧（事件流模型）
async function handleB(
  body: Body,
  res: import("node:http").ServerResponse,
): Promise<void> {
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b: system=${body.system ? "顶层" : "无"}`,
  );

  try {
    // B: system 放顶层（不在 messages 里）
    const stream = bClient.messages.stream({
      model: env.MINIMAX_ANTHROPIC_MODEL,
      system: body.system,
      max_tokens: env.MINIMAX_ANTHROPIC_MAX_TOKENS,
      messages: [{ role: "user", content: body.message }],
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // B 的流式是事件流；这里把每个 text 增量发一帧，
    // 让前端能用「同一种累加 content」的方式对齐看。
    // 末帧发 usage + stop_reason（对照 A 的 usage / finish_reason 命名）。
    let textFrameCount = 0;
    let accumulatedText = "";
    stream.on("text", (textDelta: string) => {
      textFrameCount += 1;
      accumulatedText += textDelta;
      res.write(
        `data: ${JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text", text: textDelta },
          accumulated: accumulatedText, // 教学辅助：让前端不用自己拼也能用
        })}\n\n`,
      );
    });

    const finalMessage = await stream.finalMessage();
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b: 文本增量 ${textFrameCount} 次`,
    );

    // 末帧：对照 A 的 usage 命名
    res.write(
      `data: ${JSON.stringify({
        type: "message_stop",
        stop_reason: finalMessage.stop_reason,
        usage: {
          input_tokens: finalMessage.usage.input_tokens,
          output_tokens: finalMessage.usage.output_tokens,
        },
        accumulated: accumulatedText,
      })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${(performance.now() / 1000).toFixed(2)}s] /api/b error:`, err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  }
}

// 6.3) 一次性对照：同时跑 A 和 B（非流式）
// 一次性响应里 A 用 choices[0].message.content / finish_reason / usage.prompt_tokens
//                 B 用 content[0].text / stop_reason / usage.input_tokens
// 把两侧完整响应原样返回，让前端能并排对照。
async function handleCompare(
  body: Body,
): Promise<{ a: unknown; b: unknown }> {
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/compare: 开始同 prompt 跑 A 和 B`,
  );

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  messages.push({ role: "user", content: body.message });

  // 用 Promise.all 让 A、B 并发起跑（不阻塞）
  const [aResult, bResult] = await Promise.allSettled([
    aClient.chat.completions.create({
      model: env.MINIMAX_MODEL,
      messages,
      stream: false,
    }),
    bClient.messages.create({
      model: env.MINIMAX_ANTHROPIC_MODEL,
      system: body.system,
      max_tokens: env.MINIMAX_ANTHROPIC_MAX_TOKENS,
      messages: [{ role: "user", content: body.message }],
    }),
  ]);

  // plain 化（zod 实例）
  const a = aResult.status === "fulfilled"
    ? JSON.parse(JSON.stringify(aResult.value))
    : { error: aResult.reason instanceof Error ? aResult.reason.message : String(aResult.reason) };
  const b = bResult.status === "fulfilled"
    ? JSON.parse(JSON.stringify(bResult.value))
    : { error: bResult.reason instanceof Error ? bResult.reason.message : String(bResult.reason) };

  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/compare: 完成`,
  );

  return { a, b };
}

// 6.4) thinking 差异对照：4 组场景一次性跑
// 直观看 6 个差异点：
//   1. content 形态（string vs block 数组）
//   2. thinking 位置（嵌 content 字符串 vs 独立 block vs 无）
//   3. usage 字段命名（prompt/completion/reasoning_tokens vs input/output）
//   4. thinking 是否单独计费（reasoning_tokens 字段 / thinking 块是否独立计费）
//   5. 文本答案长度（含/不含 thinking）
//   6. finish_reason vs stop_reason 字段名
async function handleThinkCompare(
  body: Body,
): Promise<{ scenarios: unknown[] }> {
  const prompt = body.message;
  const system = body.system;
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/think-compare: 开始 4 组对比`,
  );

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  // 4 组场景
  const scenarios = [
    { label: "A · 不带 thinking", protocol: "A" as const, thinking: null },
    { label: "B · 不带 thinking", protocol: "B" as const, thinking: null },
    {
      label: "B · 带 thinking (budget=100)",
      protocol: "B" as const,
      thinking: { type: "enabled" as const, budget_tokens: 100 },
    },
    {
      label: "B · 带 thinking (budget=500)",
      protocol: "B" as const,
      thinking: { type: "enabled" as const, budget_tokens: 500 },
    },
  ];

  // 并发起跑（4 个独立请求，不阻塞）
  const results = await Promise.all(
    scenarios.map(async (sc) => {
      try {
        if (sc.protocol === "A") {
          // 协议 A：不支持 thinking 参数；总是返回 string content（嵌 <think>）
          const r = await aClient.chat.completions.create({
            model: env.MINIMAX_MODEL,
            messages,
            stream: false,
          });
          const plain = JSON.parse(JSON.stringify(r));
          const text: string = plain.choices?.[0]?.message?.content ?? "";
          const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
          const thinkingText = thinkMatch?.[1] ?? "";
          return {
            scenario: sc.label,
            protocol: "A" as const,
            thinkingParam: null,
            contentType: "string" as const,
            textAnswer: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(),
            thinking: {
              exists: thinkMatch !== null,
              location: thinkMatch
                ? ("embedded_in_content" as const)
                : ("none" as const),
              charCount: thinkingText.length,
              preview: thinkingText.slice(0, 300),
            },
            usage: plain.usage ?? {},
            finishReason: plain.choices?.[0]?.finish_reason ?? null,
            stopReason: null,
          };
        }
        // 协议 B：thinking 参数控制是否启用 extended thinking block
        const r = await bClient.messages.create({
          model: env.MINIMAX_ANTHROPIC_MODEL,
          system,
          // Anthropic 协议：max_tokens 必须 >= budget_tokens；学习阶段给够
          max_tokens: Math.max(sc.thinking?.budget_tokens ?? 0, 2048),
          ...(sc.thinking ? { thinking: sc.thinking } : {}),
          messages: [{ role: "user", content: prompt }],
        });
        const plain = JSON.parse(JSON.stringify(r));
        const blocks: Array<{ type: string; text?: string; thinking?: string }> =
          plain.content ?? [];
        const textBlocks = blocks.filter((b) => b.type === "text");
        const thinkingBlocks = blocks.filter((b) => b.type === "thinking");
        const textAnswer = textBlocks.map((b) => b.text ?? "").join("");
        const thinkingText = thinkingBlocks
          .map((b) => b.thinking ?? "")
          .join("");
        return {
          scenario: sc.label,
          protocol: "B" as const,
          thinkingParam: sc.thinking,
          contentType: "block_array" as const,
          textAnswer,
          thinking: {
            exists: thinkingBlocks.length > 0,
            location:
              thinkingBlocks.length > 0
                ? ("separate_block" as const)
                : ("none" as const),
            charCount: thinkingText.length,
            preview: thinkingText.slice(0, 300),
          },
          usage: plain.usage ?? {},
          finishReason: null,
          stopReason: plain.stop_reason ?? null,
        };
      } catch (err: unknown) {
        return {
          scenario: sc.label,
          protocol: sc.protocol,
          thinkingParam: sc.thinking,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/think-compare: 4 组完成`,
  );

  return { scenarios: results };
}

// 6.5) 协议 B 流式 + 启用 thinking：完整事件流
// 与 /api/b 区别：本端点主动传 `thinking: { type: "enabled", budget_tokens: N }`，
// 让学习者实时看到「带思考模式时协议 B 的完整事件序列」：
//   message_start → content_block_start (thinking) → 多个 content_block_delta (thinking)
//                 → content_block_stop → content_block_start (text) → 多个 content_block_delta (text)
//                 → content_block_stop → message_delta (usage + stop_reason) → message_stop
// 用 stream.on("streamEvent", ...) 拿原始事件；不订阅 text / finalMessage。
async function handleBThinkingStream(
  body: Body,
  res: import("node:http").ServerResponse,
): Promise<void> {
  const thinkingBudget = body.thinking_budget ?? 500;
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream: budget=${thinkingBudget}`,
  );

  try {
    const stream = bClient.messages.stream({
      model: env.MINIMAX_ANTHROPIC_MODEL,
      system: body.system,
      // Anthropic 协议：max_tokens ≥ budget_tokens
      max_tokens: Math.max(thinkingBudget, 2048),
      thinking: { type: "enabled", budget_tokens: thinkingBudget },
      messages: [{ role: "user", content: body.message }],
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let eventIdx = 0;
    // 关键：用 on("streamEvent", ...) 拿 SDK 内部的原始事件（不是 on("text") 或 on("event")）
    stream.on("streamEvent", (evt: unknown) => {
      eventIdx += 1;
      // plain 化保险（zod / class instance → plain object）
      const plain = JSON.parse(JSON.stringify(evt));
      // 后端日志：让学习者肉眼看见每个事件的 type
      const type =
        (plain as { type?: string }).type ?? "(no type)";
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream 事件 #${eventIdx}: ${type}`,
      );
      res.write(`data: ${JSON.stringify(plain)}\n\n`);
    });

    await stream.finalMessage();
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream: 流结束，共 ${eventIdx} 个事件`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream error:`,
      err,
    );
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  }
}

// 6.6) 协议 A 流式（OpenAI chunk 原样转发 + meta frame）
// 每帧 SSE 格式：data: {"type":"openai_chunk", "kind":"...","frameIdx":N,"chunk":{...原 OpenAI chunk JSON...}}\n\n
// kind 分类（前端可按颜色区分）：
//   - "role"   : 帧 #1，只有 delta.role="assistant"，无 content
//   - "chunk"  : 增量文本帧（含 delta.content，可能含 <think>...</think> 标记）
//   - "finish" : 含 choices[0].finish_reason（如 "stop"）
//   - "usage"  : 纯 usage 帧（choices=[] 或 choices 不存在，usage 字段完整）
// 与 /api/b-thinking-stream 形成对照：A 是「字符串帧流」、B 是「事件流」
async function handleAStreamRaw(
  body: Body,
  res: import("node:http").ServerResponse,
): Promise<void> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  messages.push({ role: "user", content: body.message });

  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw: messages.length=${messages.length}`,
  );

  try {
    const stream = await aClient.chat.completions.create({
      model: env.MINIMAX_MODEL,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let frameIdx = 0;
    for await (const chunk of stream) {
      frameIdx += 1;
      // plain 化（zod 实例）
      const plain = JSON.parse(JSON.stringify(chunk));
      const delta = plain.choices?.[0]?.delta;
      const finishReason = plain.choices?.[0]?.finish_reason;
      const usage = plain.usage;

      // 帧分类
      let kind: "role" | "chunk" | "finish" | "usage" = "chunk";
      if (usage && (!plain.choices || plain.choices.length === 0)) {
        kind = "usage";
      } else if (finishReason) {
        kind = "finish";
      } else if (delta?.role && !delta?.content) {
        kind = "role";
      }

      // 元数据 + 原 chunk 一起发（前端可读 kind 也可读原 chunk）
      res.write(
        `data: ${JSON.stringify({
          type: "openai_chunk",
          kind,
          frameIdx,
          chunk: plain,
        })}\n\n`,
      );

      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw 帧 #${frameIdx} [${kind}]: delta.content=${JSON.stringify(delta?.content ?? "").slice(0, 60)}${delta?.content && delta.content.length > 60 ? "..." : ""}`,
      );
    }
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw: 完成，共 ${frameIdx} 帧`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw error:`,
      err,
    );
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  }
}

// 6.7) 协议 B 流式（不启用 thinking：原样转发事件流）
// 与 /api/a-stream-raw 形成四向对照（A 有/无 thinking × B 有/无 thinking）。
// 事件流用 stream.on("streamEvent", ...) 拿 SDK 内部原始事件原样转发；
// 每帧 SSE 格式：data: {"type":"anthropic_event", "eventIdx":N, "event":{...}}\n\n
async function handleBStreamRaw(
  body: Body,
  res: import("node:http").ServerResponse,
): Promise<void> {
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw: system=${body.system ? "顶层" : "无"}, thinking=不启用`,
  );

  try {
    const stream = bClient.messages.stream({
      model: env.MINIMAX_ANTHROPIC_MODEL,
      system: body.system,
      max_tokens: env.MINIMAX_ANTHROPIC_MAX_TOKENS,
      // 关键：不传 thinking 参数
      messages: [{ role: "user", content: body.message }],
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let eventIdx = 0;
    stream.on("streamEvent", (evt: unknown) => {
      eventIdx += 1;
      const plain = JSON.parse(JSON.stringify(evt));
      const type = (plain as { type?: string }).type ?? "(no type)";
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw 事件 #${eventIdx}: ${type}`,
      );
      res.write(
        `data: ${JSON.stringify({
          type: "anthropic_event",
          eventIdx,
          event: plain,
        })}\n\n`,
      );
    });

    await stream.finalMessage();
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw: 流结束，共 ${eventIdx} 个事件`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw error:`,
      err,
    );
    const msg = err instanceof Error ? err.message : String(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    } else {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    }
  }
}

// ── 7) 启动 ──
// 端口：§5.3.3 `5{MM}{SS}` → 50202
app.listen(env.PORT, "127.0.0.1", () => {
  console.log(`──── 协议 A vs B 对照 Demo（§5.3 React + koa · HTML 内联块） · 已启动 ────`);
  console.log(`  浏览器打开:  http://127.0.0.1:${env.PORT}/`);
  console.log(`  GET  /                     → public/index.html（React + Babel 内联块）`);
  console.log(`  GET  /health               → { ok, a, b }`);
  console.log(`  POST /api/a                → 协议 A 流式（MiniMax /v1, openai SDK）`);
  console.log(`  POST /api/b                → 协议 B 流式（MiniMax /anthropic, @anthropic-ai/sdk）`);
  console.log(`  POST /api/compare          → 一次性两侧对照（非流式）`);
  console.log(`  POST /api/think-compare    → 4 组 thinking 差异对照（A 不带 / B 不带 / B 带 100 / B 带 500）`);
  console.log(`  POST /api/b-thinking-stream → 协议 B 流式 + 启用 thinking（看完整事件流：thinking block + text block + message_delta）`);
  console.log(`  POST /api/a-stream-raw     → 协议 A 流式（OpenAI chunk 原样转发 + meta frame：role / chunk / finish / usage）`);
  console.log(`  POST /api/b-stream-raw     → 协议 B 流式（不启用 thinking，原样转发事件流）`);
  console.log(`  模型: ${env.MINIMAX_MODEL} / ${env.MINIMAX_ANTHROPIC_MODEL}`);
  console.log(`  Ctrl+C 退出`);
});
