/**
 * 模块 00 · API Key / 计费 · React + koa（§5.3 HTML 内联块版）
 *
 * 职责：koa server（@koa/router + koa-static + @koa/bodyparser）
 *   - GET  /             → public/index.html（HTML 内联 React 代码 + Babel Standalone）
 *   - GET  /health       → { ok, model, port }
 *   - POST /api/billing  → 调一次 LLM（非流式），返回 usage + 回复
 *
 * 数据流（前端）：
 *   浏览器 GET /             → public/index.html（Tailwind + React UMD + Babel Standalone CDN）
 *   浏览器执行 type="text/babel" 内联块 → Babel 运行时转译 JSX → React.createElement(...)
 *                          → ReactDOM.createRoot(#root).render(<App />)
 *   浏览器 POST /api/billing → koa router → openai SDK → chat.completions.create → JSON
 *
 * 概念/取舍/踩坑：docs/学习模块/00-环境准备/01-API-Key-计费.md
 * 跑前需要：apps/.env 里填 MINIMAX_API_KEY（模块 00 mini-app 已设）。
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

// ── 1) 环境变量校验 ──
const envSchema = z.object({
  MINIMAX_API_KEY: z.string().min(1, "请在 apps/.env 中设置 MINIMAX_API_KEY"),
  MINIMAX_BASE_URL: z.string().url().default("https://api.minimaxi.com/v1"),
  MINIMAX_MODEL: z.string().default("MiniMax-M3"),
  PORT: z.coerce.number().int().positive().default(50001),
});
const env = envSchema.parse(process.env);

// ── 2) OpenAI 客户端 ──
const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

// ── 3) koa + router + static ──
const app = new Koa();
const router = new Router();

// 3.1) bodyparser（§5.3.5 显式声明 body 解析）
app.use(bodyParser());

// 3.2) /health
router.get("/health", (ctx: Context) => {
  ctx.body = { ok: true, model: env.MINIMAX_MODEL, port: env.PORT };
});

// 3.3) POST /api/billing
const bodySchema = z.object({
  prompt: z.string().min(1).max(2000).default("只回复一个字：好"),
});
router.post("/api/billing", async (ctx: Context, _next: Next) => {
  const parsed = bodySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: "请求体不合法", detail: parsed.error.issues };
    return;
  }
  const { prompt } = parsed.data;
  const t0 = performance.now();
  console.log(
    `[/api/billing] prompt=${JSON.stringify(prompt.slice(0, 40))}${prompt.length > 40 ? "…" : ""}`,
  );

  try {
    const completion = await client.chat.completions.create({
      model: env.MINIMAX_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 16,
      stream: false,
    });
    const usage = completion.usage;
    if (!usage) {
      ctx.status = 502;
      ctx.body = {
        error: "响应里没有 usage 字段",
        hint: "去 MiniMax 控制台账单页对照，不要猜",
      };
      return;
    }
    const text = completion.choices[0]?.message.content ?? "";
    console.log(
      `[/api/billing] ✅ 耗时 ${(performance.now() - t0).toFixed(0)}ms | prompt=${usage.prompt_tokens} completion=${usage.completion_tokens} total=${usage.total_tokens}`,
    );
    ctx.body = {
      model: env.MINIMAX_MODEL,
      reply: text,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
      durationMs: Math.round(performance.now() - t0),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[/api/billing] error:`, err);
    ctx.status = 500;
    ctx.body = { error: msg };
  }
});

app.use(router.routes()).use(router.allowedMethods());

// 3.4) 静态资源（public/index.html）—— React 代码已在 HTML 内联
//   § 关键：serve 第一个参数必须绝对路径；相对路径是相对 process.cwd()，不可靠
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

// ── 4) 启动 ──
app.listen(env.PORT, "127.0.0.1", () => {
  console.log(`──── API Key / 计费 Demo（§5.3 React + koa · HTML 内联块） · 已启动 ────`);
  console.log(`  浏览器打开:  http://127.0.0.1:${env.PORT}/`);
  console.log(`  POST /api/billing → 调一次 LLM（非流式），返回 usage`);
  console.log(`  GET  /health      → { ok, model, port }`);
  console.log(`  模型: ${env.MINIMAX_MODEL}`);
  console.log(`  Ctrl+C 退出`);
});
