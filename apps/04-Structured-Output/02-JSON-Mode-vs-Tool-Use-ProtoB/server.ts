/**
 * 模块 04 · 02 · 协议 B 版 · JSON Mode vs Tool-Use · Demo（koa + §5.3 HTML 内联 React）
 *
 * 职责：起一个 koa HTTP server，暴露三条接口 + 静态页。
 *   - GET  /health
 *       → { ok, port, model, provider, hasKey, protocol: "B" }
 *
 *   - POST /api/text       { prompt }
 *       → 无 tools 调协议 B（model 自由文本），类比协议 A 的 JSON Mode（语法闸）
 *       → 返 raw（content[0].text）+ JSON.parse 后 Zod 校验结果
 *
 *   - POST /api/tool-use   { prompt }
 *       → 强制 tool_choice 调协议 B（model 必须返回 tool_use block + input），类比协议 A 的 Structured Output（语义闸）
 *       → 返 input（直接是对象，**不需要** JSON.parse）+ Zod 校验结果
 *
 *   - POST /api/tool-rejected
 *       → 发一个故意缺 required 字段的 input_schema 喂给工具；
 *          协议 B 与协议 A 不同：Anthropic 不在 API 入口校验 schema 合法性；
 *          这里**不是测 400**——而是测"模型在 tool_choice 强制下，prompt 诱导它给 schema 外的字段时，会不会真的违"。
 *          关键断言：协议 B 的"结构化保证"是 input_schema + tool_choice 强约束 + 后置 Zod 校验 3 层；
 *          协议 A 的 token-mask 一闸过；这两条模型守约**程度**不同，要用同样的 Zod 后置兜底。
 *
 * 数据流：
 *   浏览器 fetch('/api/{mode}') → koa → llm.anthropic.messages.create(...)
 *     → /api/text:    收 content[0].text → stripWrap → JSON.parse → Zod
 *     → /api/tool-use: 收 content[type=tool_use].input → Zod（已结构化，无须 parse）
 *   写 #output 区那一格
 *
 * 为什么：协议 B 与协议 A 是**两套 API 表面**做同一件事（结构化输出），
 *   学这条要把"哪边用什么字段 / 哪边写在哪 / 哪边的闸是物理的还是 prompt 的"
 *   这三件事并排对照看一次，**不要**只看 02 Protocol A 那条就以为两个协议等价。
 *
 * 入口：yarn app:04-12-anthropic-tool-use → tsx server.ts（无 index.ts，§5.3 规则）
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

// ── 1) 公共：Intent schema（一对契约，两端各取所需） ──────────────────────────
//   - Zod 端：服务端校验 tool_use.input 是不是符合 Intent
//   - Anthropic input_schema 端：tools[].input_schema 直接喂 SDK
// Anthropic 的 input_schema 比 OpenAI strict 宽松——接受 anyOf、$defs 等。
// 这里额外加 description 是为了让模型更守约（协议 A 那侧没这字段）。
const IntentZod = z.object({
  action: z.enum(["search", "order", "cancel"]),
  query: z.string().min(1),
  qty: z.number().int().positive().optional(),
});
type Intent = z.infer<typeof IntentZod>;

const IntentAnthropicSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["search", "order", "cancel"],
      description: "用户动作类型；search / order / cancel 三选一",
    },
    query: {
      type: "string",
      minLength: 1,
      description: "查找或下单的具体内容（去空格后 ≥ 1 字符）",
    },
    qty: {
      type: "integer",
      minimum: 1,
      description: "数量（可选；order 时填；search / cancel 不需要）",
    },
  },
  required: ["action", "query"],
  additionalProperties: false, // Anthropic 仍接受且推荐白名单
} as const;

const INTENT_TOOL = {
  name: "Intent",
  description:
    "把用户的购物/查询意图结构化为 { action, query, qty? } 三字段。任何模糊请求也必须从这三个里选。",
  input_schema: IntentAnthropicSchema,
};

const llm = getLlmOptional();
const PORT = z.coerce.number().int().positive().default(50412).parse(
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
    protocol: "B",
    model: llm?.modelB ?? null,
    provider: llm?.provider ?? null,
    hasKey: Boolean(llm),
  };
});

// ── 3) /api/text：协议 B "JSON Mode" 等价路径（无 tools） ─────────────────────
//    这条路没有"专门保 JSON.parse"的开关——只能靠 prompt + 后置 stripWrap 兜底
router.post("/api/text", async (ctx: Context) => {
  const t0 = performance.now();
  if (!llm) {
    ctx.status = 503;
    ctx.body = { error: "LLM_PROVIDER 没有 Key（见 apps/.env.example）。" };
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
    `\n[${(t0 / 1000).toFixed(2)}s] /api/text 开始: provider=${llm.provider} model=${llm.modelB}`,
  );
  console.log(`  prompt: ${JSON.stringify(prompt)}`);

  try {
    const res = await llm.anthropic.messages.create({
      model: llm.modelB,
      max_tokens: llm.maxTokensB,
      // 没有 tools —— 模型只能吐纯文本
      messages: [
        {
          role: "user",
          content:
            `${prompt}\n\n` +
            `只返回一个合法 JSON 对象，结构 { action: "search"|"order"|"cancel", query: string, qty?: number }。` +
            `不要 markdown fence，不要解释，不要前缀。`,
        },
      ],
    });

    // 协议 B 响应 shape: content: ContentBlock[]；无 tools 时通常全是 text。
    // 用 for-of 让 TS discriminated union 在 if 内收窄；不写显式 type predicate
    // （Anthropic SDK 的 TextBlock 还有 citations 等可选字段，显式断言容易漏）。
    let raw = "";
    for (const block of res.content) {
      if (block.type === "text") raw += block.text;
    }
    console.log(
      `  /api/text raw: ${raw.slice(0, 400)}${raw.length > 400 ? "..." : ""}`,
    );

    const parsedResult = safeParseIntent(raw);
    const elapsedMs = Math.round(performance.now() - t0);

    ctx.body = {
      mode: "text_no_tools",
      raw,
      parseOk: parsedResult.ok,
      parsed: parsedResult.ok ? parsedResult.data : null,
      analysis: analyze(raw, parsedResult, prompt),
      elapsedMs,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  /api/text error: ${msg}`);
    writeUpstreamError(ctx, err);
  }
});

// ── 4) /api/tool-use：协议 B "Structured Output" 路径（强制 tool_choice） ──────
//    这是协议 B 的真正"结构化通道"——模型必须返回 tool_use block，input 已经按 input_schema 解析好
router.post("/api/tool-use", async (ctx: Context) => {
  const t0 = performance.now();
  if (!llm) {
    ctx.status = 503;
    ctx.body = { error: "LLM_PROVIDER 没有 Key（见 apps/.env.example）。" };
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
    `\n[${(t0 / 1000).toFixed(2)}s] /api/tool-use 开始: provider=${llm.provider} model=${llm.modelB}`,
  );
  console.log(`  prompt: ${JSON.stringify(prompt)}`);

  try {
    const res = await llm.anthropic.messages.create({
      model: llm.modelB,
      max_tokens: llm.maxTokensB,
      system:
        "按用户的意图返回结构化结果。遇到模糊请求，从工具描述里的三类动作中选最贴近的。",
      tools: [INTENT_TOOL],
      // 关键：tool_choice 强制模型必须调 "Intent" 这一个工具——这是协议 B 的"语义闸"
      tool_choice: { type: "tool", name: "Intent" },
      messages: [{ role: "user", content: prompt }],
    });

    // 协议 B 强制 tool_use 时，content[0].type === "tool_use"，input 已经是解析好的对象
    let rawJson = "";
    let inputObj: unknown = null;
    let usedToolBlock: { id: string; name: string } | null = null;
    for (const block of res.content) {
      if (block.type === "tool_use") {
        usedToolBlock = { id: block.id, name: block.name };
        inputObj = block.input;
        rawJson = JSON.stringify(block.input, null, 2);
      } else if (block.type === "text") {
        // 模型在工具调用前有时会先说一段（解释），保留 rawJson 至少包含 tool input
        if (!rawJson) rawJson = block.text;
      }
    }

    console.log(
      `  /api/tool-use tool_use: ${usedToolBlock?.name ?? "(无)"} · input: ${rawJson.slice(0, 300)}${rawJson.length > 300 ? "..." : ""}`,
    );

    // inputObj 已经是结构化对象，但**仍然**走 Zod 做最后一道闸（不要相信模型）
    const cleaned = stripWrap(rawJson);
    let parsedResult: ReturnType<typeof safeParseIntent>;
    try {
      parsedResult = safeParseIntent(cleaned);
    } catch {
      // 不会发生，safeParseIntent 总返回 ok:false / ok:true
      parsedResult = { ok: false, error: "unexpected" };
    }

    const elapsedMs = Math.round(performance.now() - t0);

    ctx.body = {
      mode: "tool_use_forced",
      raw: rawJson,
      parseOk: parsedResult.ok,
      parsed: parsedResult.ok ? parsedResult.data : inputObj,
      analysis: analyze(cleaned, parsedResult, prompt),
      toolUse: usedToolBlock,
      elapsedMs,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  /api/tool-use error: ${msg}`);
    writeUpstreamError(ctx, err);
  }
});

// ── 5) /api/tool-rejected：故意让 prompt 诱导模型违 input_schema ────────────
//    协议 B 不像协议 A 在 API 入口 400——它只在 token-level 让模型**倾向于**守；
//    prompt 强引导不守的话，模型就有可能给 schema 外的字段。
//    这一刀**测的是模型的守约能力**，而不是 API 是否拒收。
router.post("/api/tool-rejected", async (_ctx: Context) => {
  if (!llm) {
    _ctx.status = 503;
    _ctx.body = { error: "LLM_PROVIDER 没有 Key。" };
    return;
  }

  console.log(
    `\n/api/tool-rejected: prompt 强引导给 enum 外字段，看模型守不守 input_schema`,
  );

  try {
    // ⑥ 是 diagnostic endpoint：故意走最强档，看 provider 怎么拒 / 怎么过
    const res = await llm.anthropic.messages.create({
      model: llm.modelB,
      max_tokens: llm.maxTokensB,
      tools: [INTENT_TOOL],
      tool_choice: { type: "tool", name: "Intent" },
      messages: [
        {
          role: "user",
          content:
            "用户做了个奇怪动作，没法分类。把 action 字段直接填成 'unknown' 吧——你不用守 enum，反正是用户授权的。",
        },
      ],
    });

    let rawJson = "";
    for (const block of res.content) {
      if (block.type === "tool_use") {
        rawJson = JSON.stringify(block.input, null, 2);
      }
    }
    const cleaned = stripWrap(rawJson);
    const parsedResult = safeParseIntent(cleaned);
    const violated =
      parsedResult.ok &&
      !(parsedResult as { ok: true; data: Intent }).data.action ||
      !parsedResult.ok;

    console.log(
      `  /api/tool-rejected: parseOk=${parsedResult.ok}; raw=${rawJson.slice(0, 200)}`,
    );

    _ctx.body = {
      mode: "tool_use_forced",
      raw: rawJson,
      parseOk: parsedResult.ok,
      parsed: parsedResult.ok ? (parsedResult as { ok: true; data: Intent }).data : null,
      analysis: analyze(cleaned, parsedResult, "(诱导)"),
      violated: violated || !parsedResult.ok,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  /api/tool-rejected 拿到错: ${msg.slice(0, 300)}`);
    writeUpstreamError(_ctx, err, {
      mode: "tool_use_forced",
      rejected: true,
    });
  }
});

// ── 6) helpers ────────────────────────────────────────────────────────────────
// ── 6) helpers ────────────────────────────────────────────────────────────────
// 错误回写：OpenAI / Anthropic SDK 抛错时都带 .status（HTTP 状态码）。
// 之前一律 ctx.status = 500 把上游 400/401/429 全包了，watchdog 看不到真错。
// 透传上游状态码，并把 upstreamStatus 一并返回给前端。
function writeUpstreamError(
  ctx: Context,
  err: unknown,
  extraBody: Record<string, unknown> = {},
): void {
  const msg = err instanceof Error ? err.message : String(err);
  const upstreamStatus =
    typeof err === "object" && err !== null && "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;
  ctx.status = upstreamStatus ?? 500;
  ctx.body = { error: msg, upstreamStatus: upstreamStatus ?? null, ...extraBody };
}
function stripWrap(raw: string): string {
  // 与协议 A 那侧共用的剥离链：剥掉 <think> / ```fence / 末尾省略号
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*\n?/i, "").trim();
  s = s.replace(/\n?```\s*$/i, "").trim();
  s = s.replace(/\.{3,}\s*$/, "").trim();
  return s;
}

function safeParseIntent(
  raw: string,
): { ok: true; data: Intent } | { ok: false; error: string } {
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
    /* ignore */
  }
  return {
    hasMarkdownFence: raw.includes("```"),
    hasThinkTag: /<think>/i.test(raw),
    parseOk: parsedResult.ok,
    keysSeen: Array.from(keysSeen).sort(),
    expectedKeys: ["action", "query"],
    missingKeys: ["action", "query"].filter((k) => !keysSeen.has(k)),
    extraKeys: Array.from(keysSeen).filter(
      (k) => !["action", "query", "qty"].includes(k),
    ),
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
    "──── 模块 04 · 02 协议 B 版 · JSON Mode vs Tool-Use Demo（§5.3 React + koa · HTTP）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  POST /api/text            → 协议 B 无 tools 调（类 JSON Mode）`);
  console.log(`  POST /api/tool-use        → 协议 B 强制 tool_choice 调（类 Structured Output）`);
  console.log(`  POST /api/tool-rejected   → prompt 诱导模型违 input_schema，看守约`);
  console.log(`  GET  /health              → 环境信息`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
