/**
 * 模块 04 · 02 · JSON Mode vs Structured Output · Demo（koa + §5.3 HTML 内联 React）
 *
 * 职责：起一个 koa HTTP server，暴露三条接口 + 静态页。
 *   - GET  /health
 *       → { ok, port, model, provider, hasKey }
 *
 *   - POST /api/json-mode        { prompt }
 *       → JSON Mode 调用（语法闸：response_format: { type: "json_object" }）
 *       → 返 raw（模型原样吐）+ parsed（尝试 JSON.parse 后）+ analysis（字段对齐 / enum 偏离 / 字段名漂移 / 是否夹 markdown）
 *
 *   - POST /api/structured-output  { prompt }
 *       → Structured Output 调用（语义闸：response_format: { type: "json_schema", strict: true }）
 *       → 同上字段；如果 strict schema 写法不兼容 OpenAI 直接 400，错误回传
 *
 *   - POST /api/strict-rejected
 *       → 故意发一个 missing additionalProperties:false 的 schema，让 strict 模式直接拒收
 *       → 把 OpenAI 400 报错原文返回，看 strict 对 schema 写法也有闸
 *
 * 数据流：
 *   浏览器 fetch('/api/{mode}') → koa → OpenAI 调用 → 拿到 text
 *   → 客户端 JSON.parse + 字面对照 Intent schema → 写入 #output 那一格
 *
 * 为什么：本条要能讲清
 *   ① JSON Mode 只保 JSON.parse，不保 schema；字段漂移 / enum 自由发挥仍发生
 *   ② Structured Output（strict）= token-level mask，schema 不合规根本写不出来
 *   ③ strict 对 schema 写法本身严格（不允许 anyOf、必须 additionalProperties:false 等）
 *
 * 入口：yarn app:04-02-json-mode-vs-structured-output → tsx server.ts（无 index.ts，§5.3 规则）
 *
 * 概念 / 取舍 / 踩坑：docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context } from "koa";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getLlmOptional, logLlmConfig } from "../../llm.js";

// ── 1) 公共：Intent schema（一份契约，两端各取所需） ──────────────────────────
//   - Zod 端：服务端校验 JSON Mode 吐回来的内容（看是否真的丢字段）
//   - JSON Schema 端：喂给 OpenAI strict 模式做 token-mask
// 同一份契约手写两份，目的是不引 zod-to-json-schema 依赖；
// 生产代码里应 `zodToJsonSchema(IntentZod, "Intent")` 自动派生（见 01 沉淀「取舍」）。
const IntentZod = z.object({
  action: z.enum(["search", "order", "cancel"]),
  query: z.string().min(1),
  qty: z.number().int().positive().optional(),
});
type Intent = z.infer<typeof IntentZod>;

const IntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["action", "query"],
  properties: {
    action: { type: "string", enum: ["search", "order", "cancel"] },
    query: { type: "string", minLength: 1 },
    qty: { type: "integer", minimum: 1 },
  },
} as const;

const llm = getLlmOptional();
const PORT = z.coerce.number().int().positive().default(50402).parse(
  process.env.PORT,
);

// ── 2) koa ────────────────────────────────────────────────────────────────────
const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    port: PORT,
    model: llm?.modelA ?? null,
    provider: llm?.provider ?? null,
    hasKey: Boolean(llm),
  };
});

// ── 3) /api/json-mode：JSON Mode 调用 ─────────────────────────────────────────
router.post("/api/json-mode", async (ctx: Context) => {
  const t0 = performance.now();
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error:
        "LLM_PROVIDER 没有 Key。在 apps/.env 填对应 Key 后重启（见 apps/.env.example）。",
    };
    return;
  }

  const body = ctx.request.body as { prompt?: string };
  const prompt = body.prompt?.trim();
  if (!prompt) {
    ctx.status = 400;
    ctx.body = { error: "prompt 不能为空" };
    return;
  }

  // 服务端日志：双模式调用都打，便于对照
  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/json-mode 开始: provider=${llm.provider} model=${llm.modelA}`,
  );
  console.log(`  prompt: ${JSON.stringify(prompt)}`);

  try {
    const res = await llm.openai.chat.completions.create({
      model: llm.modelA,
      // 协议 A 的标准 JSON Mode 开关
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是一个返回 JSON 的助手。必须返回严格合法的 JSON，对应 { action: 'search'|'order'|'cancel', query: string, qty?: number≥1 }。",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = res.choices[0]?.message?.content ?? "";
    console.log(
      `  /api/json-mode raw: ${raw.slice(0, 400)}${raw.length > 400 ? "..." : ""}`,
    );

    // 尝试 JSON.parse 后做 Zod 校验，看是否真的符合 Intent schema
    const parsedResult = safeParseIntent(raw);
    const elapsedMs = Math.round(performance.now() - t0);

    ctx.body = {
      mode: "json_object",
      raw,
      parseOk: parsedResult.ok,
      parsed: parsedResult.ok ? parsedResult.data : null,
      // 字面分析：双模式对照要靠这个看"JSON Mode 下字段漂移什么样"
      analysis: analyze(raw, parsedResult, prompt),
      elapsedMs,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  /api/json-mode error: ${msg}`);
    ctx.status = 500;
    ctx.body = { error: msg };
  }
});

// ── 4) /api/structured-output：Structured Output（strict）调用 ──────────────────
router.post("/api/structured-output", async (ctx: Context) => {
  const t0 = performance.now();
  if (!llm) {
    ctx.status = 503;
    ctx.body = {
      error:
        "LLM_PROVIDER 没有 Key。在 apps/.env 填对应 Key 后重启（见 apps/.env.example）。",
    };
    return;
  }

  const body = ctx.request.body as { prompt?: string };
  const prompt = body.prompt?.trim();
  if (!prompt) {
    ctx.status = 400;
    ctx.body = { error: "prompt 不能为空" };
    return;
  }

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/structured-output 开始: provider=${llm.provider} model=${llm.modelA}`,
  );
  console.log(`  prompt: ${JSON.stringify(prompt)}`);

  try {
    const res = await llm.openai.chat.completions.create({
      model: llm.modelA,
      response_format: {
        type: "json_schema",
        // OpenAI strict 的 json_schema 容器：name + schema + strict
        json_schema: {
          name: "Intent",
          schema: IntentJsonSchema,
          strict: true,
        },
      },
      messages: [
        {
          role: "system",
          content: "按用户的意图返回结构化结果。",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = res.choices[0]?.message?.content ?? "";
    console.log(
      `  /api/structured-output raw: ${raw.slice(0, 400)}${raw.length > 400 ? "..." : ""}`,
    );

    const parsedResult = safeParseIntent(raw);
    const elapsedMs = Math.round(performance.now() - t0);

    ctx.body = {
      mode: "json_schema_strict",
      raw,
      parseOk: parsedResult.ok,
      parsed: parsedResult.ok ? parsedResult.data : null,
      analysis: analyze(raw, parsedResult, prompt),
      elapsedMs,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  /api/structured-output error: ${msg}`);
    ctx.status = 500;
    ctx.body = { error: msg };
  }
});

// ── 5) /api/strict-rejected：故意发缺 additionalProperties:false 的 schema ────
//    用来演示"strict 模式对 schema 写法本身也卡"——不是模型拒收，是 API 400
router.post("/api/strict-rejected", async (_ctx: Context) => {
  if (!llm) {
    _ctx.status = 503;
    _ctx.body = { error: "LLM_PROVIDER 没有 Key（见 apps/.env.example）。" };
    return;
  }

  console.log(
    `\n/api/strict-rejected: 故意发一个不严格 schema，让 OpenAI strict 返 400`,
  );

  const badSchema = {
    type: "object",
    // missing "additionalProperties": false
    properties: {
      foo: { type: "string" },
      bar: { anyOf: [{ type: "string" }, { type: "number" }] }, // anyOf 不允许
    },
    required: ["foo"],
  };

  try {
    const res = await llm.openai.chat.completions.create({
      model: llm.modelA,
      response_format: {
        type: "json_schema",
        json_schema: { name: "Bad", schema: badSchema, strict: true },
      },
      messages: [{ role: "user", content: "随便返回点东西" }],
    });

    // 走到这里就怪了——bad schema + strict 应该被 API 400 才正常
    _ctx.body = {
      mode: "json_schema_strict",
      unexpectedSuccess: true,
      raw: res.choices[0]?.message?.content ?? "",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  /api/strict-rejected 拿到预期 400: ${msg.slice(0, 300)}`);
    _ctx.status = 400;
    _ctx.body = {
      mode: "json_schema_strict",
      rejected: true,
      // 把 OpenAI 报错原文回前端——它写得非常具体，会精确列出"哪条属性违反哪条 strict 规则"
      error: msg,
    };
  }
});

// ── 6) helpers ────────────────────────────────────────────────────────────────
// 模型吐回的字符串经常被三种 wrapper 包住，先剥掉再 JSON.parse / 数 keys。
//   - <think>...</think>  模型思维链前缀（minimax / DeepSeek / Qwen 推理模式普遍带）
//   - ```json ... ```   markdown fence
//   - 末尾 "..." 省略号
// 每一步后面都 .trim()：剥掉 <think> 之后可能剩 \n```json…，开头 \n 会让下个 ^``` 正则匹配不到。
function stripWrap(raw: string): string {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*\n?/i, "").trim();
  s = s.replace(/\n?```\s*$/i, "").trim();
  s = s.replace(/\.{3,}\s*$/, "").trim();
  return s;
}

function safeParseIntent(raw: string): { ok: true; data: Intent } | { ok: false; error: string } {
  const cleaned = stripWrap(raw);
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, error: `JSON.parse 失败: ${(e as Error).message}` };
  }
  const r = IntentZod.safeParse(obj);
  if (!r.success) {
    return {
      ok: false,
      error: r.error.issues
        .map((i) => `${(i.path as (string | number)[]).join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, data: r.data };
}

// 字面分析：给前端展示"两种模式下到底差在哪"。
// 不挑算法，挑能让人 5 秒看懂的事实。和 safeParseIntent 共用同一条 stripWrap，
// 保证「Zod ✓」和「keysSeen 非空」一定同进同出。
function analyze(
  raw: string,
  parsedResult: ReturnType<typeof safeParseIntent>,
  prompt: string,
): Record<string, unknown> {
  const cleaned = stripWrap(raw);

  const keysSeen = new Set<string>();
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      for (const k of Object.keys(obj as Record<string, unknown>)) {
        keysSeen.add(k);
      }
    }
  } catch {
    /* ignore — JSON.parse 失败时 keysSeen 为空，正常 */
  }

  return {
    hasMarkdownFence: raw.includes("```"),
    hasThinkTag: /<think>/i.test(raw),
    parseOk: parsedResult.ok,
    keysSeen: Array.from(keysSeen).sort(),
    expectedKeys: ["action", "query"],
    missingKeys: ["action", "query"].filter((k) => !keysSeen.has(k)),
    extraKeys: Array.from(keysSeen).filter((k) => !["action", "query", "qty"].includes(k)),
    rawLength: raw.length,
    promptLength: prompt.length,
  };
}

// ── 7) 启动 ────────────────────────────────────────────────────────────────────
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 04 · 02 JSON Mode vs Structured Output Demo（§5.3 React + koa · HTTP）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  POST /api/json-mode               → JSON Mode（语法闸）`);
  console.log(`  POST /api/structured-output       → Structured Output strict（语义闸）`);
  console.log(`  POST /api/strict-rejected         → 故意发不严格 schema，看 strict 返 400`);
  console.log(`  GET  /health                      → 环境信息`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
