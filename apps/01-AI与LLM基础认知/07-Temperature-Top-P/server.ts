/**
 * 模块 01 · 07 Temperature / Top-P · React + koa（§5.3 HTML 内联块版）
 *
 * 职责：koa server（@koa/router + koa-static + @koa/bodyparser）
 *   - GET  /             → public/index.html（HTML 内联 React 代码 + Babel Standalone）
 *   - GET  /health       → { ok, model, port }
 *   - POST /api/compare  → 同一 prompt 并发跑 3 组温度档（T=0 / 0.7 / 1.2）× 2 次 = 6 次，
 *                           剥 <think>…</think> → 判两次是否相等 → JSON { groups, ... }
 *
 * 数据流（前端）：
 *   浏览器 GET /             → public/index.html（Tailwind + React UMD + Babel Standalone CDN）
 *   浏览器执行 type="text/babel" 内联块 → Babel 运行时转译 JSX → React.createElement(...)
 *                          → ReactDOM.createRoot(#root).render(<App />)
 *   浏览器 POST /api/compare → koa router → openai SDK → chat.completions.create → JSON
 *
 * 为什么：温度管随机性——必须看见「同一 prompt × 三档温度」并排对照
 *       才能区分"低温度稳定抽取 / 中等 / 高温度创意分叉"，不能只跑两个对比就过。
 * 概念/取舍/踩坑：docs/学习模块/01-AI与LLM基础认知/07-Temperature-Top-P.md
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
  PORT: z.coerce.number().int().positive().default(50107),
});
const env = envSchema.parse(process.env);

// ── 2) 请求体校验 ──
const DEFAULT_PROMPT =
  "给一间开在海边的咖啡店起一个店名。只回店名四个字以内，不要解释。";
const bodySchema = z.object({
  prompt: z.string().min(1).max(2000).optional(),
});

// ── 3) OpenAI 客户端 ──
const client = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: env.MINIMAX_BASE_URL,
});

// ── 4) 三档温度（与本条笔记"多数文档建议只调一个"对齐：Top-P 固定 1，只动温度）──
const TEMPERATURES: readonly number[] = [0, 0.7, 1.2] as const;
const RUNS_PER_GROUP = 2;

// ── 5) 剥掉 <think>…</think>（模型若夹了思考过程，剥完再比对"四个字"本身）──
function visibleText(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// ── 6) 单次调用：非流式，温度档由参数控制 ──
type SingleRun = {
  text: string;
  durationMs: number;
  error?: string;
};

async function once(prompt: string, temperature: number): Promise<SingleRun> {
  const t0 = performance.now();
  try {
    const completion = await client.chat.completions.create({
      model: env.MINIMAX_MODEL,
      messages: [
        {
          role: "system",
          content: "只输出最终店名。不要分析过程，不要 XML 标签。",
        },
        { role: "user", content: prompt },
      ],
      temperature,
      top_p: 1,
      max_tokens: 256,
      stream: false,
    });
    const raw = completion.choices[0]?.message.content?.trim() ?? "";
    const visible = visibleText(raw);
    const text = visible.length > 0 ? visible : raw || "(空)";
    return {
      text,
      durationMs: Math.round(performance.now() - t0),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: "",
      durationMs: Math.round(performance.now() - t0),
      error: msg,
    };
  }
}

// ── 7) 一组：跑 N 次，Promise.allSettled 包，单次失败不阻塞其它 ──
type GroupResult = {
  temperature: number;
  runs: SingleRun[];
  same: boolean | null; // null = 这一组有失败，无法判定
  verdict: "STABLE" | "DIVERGED" | "PARTIAL" | "FAILED";
  verdictLabel: string;
};

async function runGroup(
  prompt: string,
  temperature: number,
): Promise<GroupResult> {
  const results = await Promise.allSettled(
    Array.from({ length: RUNS_PER_GROUP }, () =>
      once(prompt, temperature),
    ),
  );

  const runs: SingleRun[] = results.map((r, idx) => {
    if (r.status === "fulfilled") return r.value;
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    return { text: "", durationMs: 0, error: `第 ${idx + 1} 次失败：${msg}` };
  });

  const errored = runs.some((r) => r.error);
  const texts = runs.map((r) => r.text);
  // 与原代码一致：严格相等 ===（两条回复一字不差才算 STABLE）
  const allTextsEqual = texts.every((t) => t === texts[0]);

  let verdict: GroupResult["verdict"];
  let verdictLabel: string;
  let same: boolean | null;

  if (errored && runs.every((r) => r.error)) {
    verdict = "FAILED";
    verdictLabel = "❌ 本组两次都失败";
    same = null;
  } else if (errored) {
    verdict = "PARTIAL";
    verdictLabel = "⚠️ 部分失败（看下面错误）";
    same = null;
  } else if (allTextsEqual) {
    verdict = "STABLE";
    verdictLabel = "✅ 两次相同（抽取稳）";
    same = true;
  } else {
    verdict = "DIVERGED";
    verdictLabel = "🔀 两次分叉（更飘）";
    same = false;
  }

  return { temperature, runs, same, verdict, verdictLabel };
}

// ── 8) koa + router + static ──
const app = new Koa();
const router = new Router();

app.use(bodyParser());

// 8.1) /health
router.get("/health", (ctx: Context) => {
  ctx.body = { ok: true, model: env.MINIMAX_MODEL, port: env.PORT };
});

// 8.2) POST /api/compare：并发跑 3 组 × 2 次 = 6 次调用
router.post("/api/compare", async (ctx: Context, _next: Next) => {
  const parsed = bodySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: "请求体不合法", detail: parsed.error.issues };
    return;
  }
  const prompt = parsed.data.prompt ?? DEFAULT_PROMPT;
  const t0 = performance.now();
  console.log(
    `[/api/compare] prompt=${JSON.stringify(prompt.slice(0, 40))}${prompt.length > 40 ? "…" : ""}`,
  );

  try {
    // 三组并行；每组内 2 次也并行
    const groups = await Promise.all(
      TEMPERATURES.map((t) => runGroup(prompt, t)),
    );

    console.log(
      `[/api/compare] ✅ 完成 | 耗时 ${(performance.now() - t0).toFixed(0)}ms`,
    );

    ctx.body = {
      model: env.MINIMAX_MODEL,
      prompt,
      topP: 1,
      temperatures: TEMPERATURES,
      runsPerGroup: RUNS_PER_GROUP,
      groups,
      durationMs: Math.round(performance.now() - t0),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[/api/compare] error:`, err);
    ctx.status = 500;
    ctx.body = { error: msg };
  }
});

app.use(router.routes()).use(router.allowedMethods());

// 8.3) 静态资源（public/index.html）—— React 代码已在 HTML 内联
//   § 关键：serve 第一个参数必须绝对路径；相对路径是相对 process.cwd()，不可靠
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

// ── 9) 启动 ──
app.listen(env.PORT, "127.0.0.1", () => {
  console.log(`──── Temperature / Top-P Demo（§5.3 React + koa · HTML 内联块） · 已启动 ────`);
  console.log(`  浏览器打开:  http://127.0.0.1:${env.PORT}/`);
  console.log(`  POST /api/compare  → 跑 3 组温度 × 2 次 = 6 次调用`);
  console.log(`  GET  /health       → { ok, model, port }`);
  console.log(`  模型: ${env.MINIMAX_MODEL}    默认端口: ${env.PORT}`);
  console.log(`  Ctrl+C 退出`);
});