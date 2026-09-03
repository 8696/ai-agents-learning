/**
 * 模块 05 · 01 · Function Calling 协议 · Demo（koa + §5.3 HTML 内联 React · 仅协议 A）
 *
 * 职责：起 koa HTTP server，暴露工具注册表 + 完整 Function Calling 一圈。
 *   - GET  /health
 *       → { ok, port, model, provider, hasKey }
 *
 *   - GET  /tools
 *       → Registry 当前注册的 Tool 列表（name + description + JSON Schema）
 *
 *   - POST /api/run              { prompt }
 *       → 完整 Round 1 → Round 2 → 终止
 *       → 同 prompt 可触发单 tool / 并行多 tool（看模型怎么选）
 *
 *   - POST /api/run-serial       { prompt }
 *       → 演示串行数据依赖：循环跑直到 stop（最多 5 轮）
 *       → 用例："查 u001 的用户，把他的 level 加 7，结果告诉我"
 *       → Round 1 查 user → Round 2 add(level, 7) → Round 3 总结
 *
 *   - POST /api/simulate-zod-error    { prompt? }
 *       → server 端绕过模型，篡改 Round 1 的 tool_call.arguments 成非法值
 *       → Zod 校验失败 → error.issues 当 tool_result 回灌
 *       → Round 2 模型修复（重新调 add 给合法参数）
 *       → Round 3 真正执行 add → Round 4 拿到 stop
 *       → 全程展示"Zod ✗ → repair → Zod ✓"的修复闭环
 *
 * 数据流：
 *   浏览器 fetch('/api/{mode}') → koa → 调 llm.openai.chat.completions.create
 *   → 拿 tool_calls → registry 找 handler → Zod 校验 arguments
 *   → handler 执行（错误回传不抛）→ 拼 tool_result → 再调 model → stop 拿 content
 *
 * 为什么：本条要能讲清
 *   ① 完整一圈：model → tool_calls → execute → tool_result → model → stop
 *   ② 并行调用：Promise.all（tool_calls 之间无依赖）
 *   ③ 串行调用：循环到 model 不再返回 tool_calls
 *   ④ Zod 校验 + repair：参数非法 → issues 回灌 → 模型改对再发
 *   ⑤ 工具执行失败：handler throw 不挂循环，错误信息回传模型
 *
 * 入口：yarn app:05-01-function-calling-protocol → tsx server.ts（无 index.ts，§5.3 规则）
 *
 * 概念 / 取舍 / 踩坑：docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md
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
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";

// ── 1) Tool Registry ─────────────────────────────────────────────────────────
//   Zod schema 派生 JSON Schema 喂给模型（OpenAI 协议 A function calling 入口）
//   同时服务端 Zod safeParse 验 tool_call.arguments（04 条"同一份契约"）
type ToolHandler<P> = (input: P) => Promise<unknown>;
interface ToolDef<P = unknown> {
  name: string;
  description: string;
  input: z.ZodType<P>;
  handler: ToolHandler<P>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ToolDef<any>>();

function defineTool<P>(tool: ToolDef<P>): ToolDef<P> {
  if (registry.has(tool.name)) throw new Error(`Tool ${tool.name} 已注册`);
  registry.set(tool.name, tool);
  return tool;
}

// ── 2) 4 个 Tool（calculator / weather / search / database） ─────────────────
//   验收要求"3~4 个 Tool"，本 demo 4 个。参数全 Zod 校验，非法参数不打 handler。
defineTool({
  name: "add",
  description:
    "把两个数字相加，返回 { sum: number }。a / b 都是 number（含整数和小数）。",
  input: z.object({ a: z.number(), b: z.number() }),
  handler: async ({ a, b }) => ({ sum: a + b }),
});

defineTool({
  name: "get_weather",
  description:
    "查某城市当前天气（mock 数据），返回 { city, temp_c, condition }。",
  input: z.object({ city: z.string().min(1) }),
  handler: async ({ city }) => ({
    city,
    temp_c: city === "北京" ? 25 : 22,
    condition: "晴",
  }),
});

defineTool({
  name: "lookup_user",
  description:
    "按 user_id 查用户信息（mock 数据库），返回 { id, name, level, points }。user_id 形如 u001。",
  input: z.object({
    user_id: z
      .string()
      .regex(/^u\d+$/, "user_id 必须形如 u001（u 开头 + 数字）"),
  }),
  handler: async ({ user_id }) => {
    // u999 故意抛错，演示"工具执行失败 → 错误回传模型"分支
    if (user_id === "u999") {
      throw new Error("数据库连接超时（mock 故意抛错）");
    }
    return { id: user_id, name: "测试用户", level: 3, points: 1200 };
  },
});

defineTool({
  name: "search_wiki",
  description:
    "查 wiki 摘要（mock 数据），返回 { title, summary }。query 至少 2 个字符。",
  input: z.object({ query: z.string().min(2) }),
  handler: async ({ query }) => ({
    title: query,
    summary: `${query} 是一段 mock 摘要（仅用于演示 search 类 tool 的返回结构）。`,
  }),
});

// ── 3) Zod → JSON Schema（手写简化版，覆盖本 demo 4 种类型） ──────────────────
//   生产代码应引 `zod-to-json-schema` 包；本 demo 不为这一个包拉新依赖。
//   支持：ZodObject / ZodString（含 min/max/regex）/ ZodNumber（含 min/max/int）/ ZodOptional
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const _def = (schema as { _def?: { typeName?: string; innerType?: z.ZodType; checks?: unknown[]; shape?: () => Record<string, z.ZodType> } })._def;
  if (!_def) return {};
  const tn = _def.typeName;

  // .optional() 透传 innerType（默认全必填，要 .optional() 才允许缺）
  if (tn === "ZodOptional") return zodToJsonSchema(_def.innerType as z.ZodType);

  if (tn === "ZodString") {
    const out: Record<string, unknown> = { type: "string" };
    for (const c of (_def.checks ?? []) as Array<{ kind: string; value?: number; regex?: { source: string } }>) {
      if (c.kind === "min") out.minLength = c.value;
      if (c.kind === "max") out.maxLength = c.value;
      if (c.kind === "regex") out.pattern = c.regex?.source;
    }
    return out;
  }

  if (tn === "ZodNumber") {
    const out: Record<string, unknown> = { type: "number" };
    for (const c of (_def.checks ?? []) as Array<{ kind: string; value?: number }>) {
      if (c.kind === "min") out.minimum = c.value;
      if (c.kind === "max") out.maximum = c.value;
      if (c.kind === "int") out.type = "integer";
    }
    return out;
  }

  if (tn === "ZodObject") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    const shape = _def.shape!();
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      const inner = (value as { _def?: { typeName?: string } })._def;
      if (inner?.typeName !== "ZodOptional") required.push(key);
    }
    return {
      type: "object",
      properties,
      required,
      additionalProperties: false, // OpenAI strict 写法要求白名单
    };
  }

  // 兜底：未知类型按 string 处理（demo 不应走到这）
  return { type: "string" };
}

// ── 4) OpenAI tools 字段构造（按 registry 全部展开） ─────────────────────────
function buildOpenAITools() {
  return Array.from(registry.values()).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.input),
    },
  }));
}

// ── 5) 公共：执行 tool_calls（并行 · 错误回传不抛） ───────────────────────────
type ToolResultOut = {
  tool_call_id: string;
  role: "tool";
  content: string;
  parseOk: boolean;
  executeOk: boolean;
  toolName: string;
  rawArgs: unknown;
  durationMs: number;
};

async function executeToolCalls(
  toolCalls: ChatCompletionMessageToolCall[],
): Promise<ToolResultOut[]> {
  return Promise.all(
    toolCalls.map(async (tc): Promise<ToolResultOut> => {
      const t0 = performance.now();
      const tool = registry.get(tc.function.name);
      if (!tool) {
        return {
          tool_call_id: tc.id,
          role: "tool",
          content: `未知工具 ${tc.function.name}`,
          parseOk: false,
          executeOk: false,
          toolName: tc.function.name,
          rawArgs: null,
          durationMs: Math.round(performance.now() - t0),
        };
      }

      // ① JSON.parse arguments
      let args: unknown;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch (e) {
        return {
          tool_call_id: tc.id,
          role: "tool",
          content: `arguments 不是合法 JSON: ${(e as Error).message}`,
          parseOk: false,
          executeOk: false,
          toolName: tc.function.name,
          rawArgs: tc.function.arguments,
          durationMs: Math.round(performance.now() - t0),
        };
      }

      // ② Zod 校验
      const parsed = tool.input.safeParse(args);
      if (!parsed.success) {
        const errMsg = parsed.error.issues
          .map((i) => `${(i.path as (string | number)[]).join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        return {
          tool_call_id: tc.id,
          role: "tool",
          content: `参数错误: ${errMsg}`,
          parseOk: false,
          executeOk: false,
          toolName: tc.function.name,
          rawArgs: args,
          durationMs: Math.round(performance.now() - t0),
        };
      }

      // ③ handler 执行（throw 不挂循环）
      try {
        const out = await tool.handler(parsed.data);
        return {
          tool_call_id: tc.id,
          role: "tool",
          content: JSON.stringify(out),
          parseOk: true,
          executeOk: true,
          toolName: tc.function.name,
          rawArgs: args,
          durationMs: Math.round(performance.now() - t0),
        };
      } catch (err) {
        return {
          tool_call_id: tc.id,
          role: "tool",
          content: `执行失败: ${err instanceof Error ? err.message : String(err)}`,
          parseOk: true,
          executeOk: false,
          toolName: tc.function.name,
          rawArgs: args,
          durationMs: Math.round(performance.now() - t0),
        };
      }
    }),
  );
}

// ── 6) 公共：把 tool_results 转成可追加到 messages 的形态 ──────────────────────
function toolResultsToMessages(results: ToolResultOut[]): ChatCompletionMessageParam[] {
  return results.map((r) => ({
    role: "tool",
    tool_call_id: r.tool_call_id,
    content: r.content,
  }));
}

// ── 7) helpers：上游错误透传（参考 04 demo writeUpstreamError） ───────────────
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

// ── 8) koa + router ──────────────────────────────────────────────────────────
const app = new Koa();
const router = new Router();
const llm = getLlmOptional();
const PORT = z.coerce.number().int().positive().default(50501).parse(process.env.PORT ?? undefined);

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    port: PORT,
    model: llm?.modelA ?? null,
    provider: llm?.provider ?? null,
    hasKey: Boolean(llm),
    tools: Array.from(registry.keys()),
  };
});

router.get("/tools", (ctx: Context) => {
  // 展示注册表全貌 + 每个 tool 的 Zod ↔ JSON Schema 派生关系
  ctx.body = Array.from(registry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    jsonSchema: zodToJsonSchema(t.input),
  }));
});

// ── 9) /api/run：完整 Round 1 → Round 2 → 终止 ──────────────────────────────
//   单 tool / 并行多 tool 都走这条；模型自行决定调用哪个 / 几次
router.post("/api/run", async (ctx: Context) => {
  const t0 = performance.now();
  if (!llm) {
    ctx.status = 503;
    ctx.body = { error: "LLM_PROVIDER 没有 Key（见 apps/.env.example）。" };
    return;
  }
  const { prompt } = ctx.request.body as { prompt?: string };
  if (!prompt?.trim()) {
    ctx.status = 400;
    ctx.body = { error: "prompt 不能为空" };
    return;
  }

  console.log(`\n[${(t0 / 1000).toFixed(2)}s] /api/run 开始: provider=${llm.provider} model=${llm.modelA}`);
  console.log(`  prompt: ${JSON.stringify(prompt)}`);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "你可以使用工具（add / get_weather / lookup_user / search_wiki）。能用工具完成的不要直接猜。",
    },
    { role: "user", content: prompt },
  ];

  try {
    const rounds: Array<{
      round: number;
      finish_reason: string | null;
      content: string | null;
      tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
      toolResults: ToolResultOut[];
    }> = [];

    // Round 1
    const r1 = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages,
      tools: buildOpenAITools(),
    });
    const m1 = r1.choices[0]?.message;
    const fr1 = r1.choices[0]?.finish_reason ?? null;
    const tcs1 = (m1?.tool_calls ?? []) as ChatCompletionMessageToolCall[];

    if (tcs1.length === 0) {
      rounds.push({
        round: 1,
        finish_reason: fr1,
        content: m1?.content ?? null,
        tool_calls: [],
        toolResults: [],
      });
      ctx.body = {
        mode: "run",
        rounds,
        finalContent: m1?.content ?? "",
        totalRounds: 1,
        elapsedMs: Math.round(performance.now() - t0),
      };
      return;
    }

    // Round 1 执行（并行）
    const r1ExecResults = await executeToolCalls(tcs1);
    rounds.push({
      round: 1,
      finish_reason: fr1,
      content: m1?.content ?? null,
      tool_calls: tcs1,
      toolResults: r1ExecResults,
    });

    // 如果 Round 1 模型返回 stop 且有 tool_calls（边界情况），也走 Round 2
    // 终止条件：tool_calls 为空 或 finish_reason === stop/length/content_filter
    if (fr1 === "stop" || fr1 === "length" || fr1 === "content_filter") {
      ctx.body = {
        mode: "run",
        rounds,
        finalContent: m1?.content ?? "",
        totalRounds: 1,
        elapsedMs: Math.round(performance.now() - t0),
      };
      return;
    }

    // Round 2：tool_results 回灌
    messages.push(m1 as ChatCompletionMessageParam, ...toolResultsToMessages(r1ExecResults));
    const r2 = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages,
      tools: buildOpenAITools(),
    });
    const m2 = r2.choices[0]?.message;
    const fr2 = r2.choices[0]?.finish_reason ?? null;
    const tcs2 = (m2?.tool_calls ?? []) as ChatCompletionMessageToolCall[];

    if (tcs2.length === 0) {
      rounds.push({
        round: 2,
        finish_reason: fr2,
        content: m2?.content ?? null,
        tool_calls: [],
        toolResults: [],
      });
      ctx.body = {
        mode: "run",
        rounds,
        finalContent: m2?.content ?? "",
        totalRounds: 2,
        elapsedMs: Math.round(performance.now() - t0),
      };
      return;
    }

    // Round 2 还有 tool_calls（如查 u999 的错误演示）→ Round 3
    if (fr2 === "stop" || fr2 === "length" || fr2 === "content_filter") {
      rounds.push({
        round: 2,
        finish_reason: fr2,
        content: m2?.content ?? null,
        tool_calls: tcs2,
        toolResults: [],
      });
      ctx.body = {
        mode: "run",
        rounds,
        finalContent: m2?.content ?? "",
        totalRounds: 2,
        elapsedMs: Math.round(performance.now() - t0),
      };
      return;
    }

    const r2ExecResults = await executeToolCalls(tcs2);
    rounds.push({
      round: 2,
      finish_reason: fr2,
      content: m2?.content ?? null,
      tool_calls: tcs2,
      toolResults: r2ExecResults,
    });
    messages.push(m2 as ChatCompletionMessageParam, ...toolResultsToMessages(r2ExecResults));

    const r3 = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages,
      tools: buildOpenAITools(),
    });
    const m3 = r3.choices[0]?.message;
    const fr3 = r3.choices[0]?.finish_reason ?? null;
    rounds.push({
      round: 3,
      finish_reason: fr3,
      content: m3?.content ?? null,
      tool_calls: (m3?.tool_calls ?? []) as ChatCompletionMessageToolCall[],
      toolResults: [],
    });

    ctx.body = {
      mode: "run",
      rounds,
      finalContent: m3?.content ?? "",
      totalRounds: 3,
      elapsedMs: Math.round(performance.now() - t0),
    };
  } catch (err: unknown) {
    console.error(`  /api/run error: ${err instanceof Error ? err.message : String(err)}`);
    writeUpstreamError(ctx, err, { mode: "run" });
  }
});

// ── 10) /api/run-serial：串行多轮（最多 5 轮） ───────────────────────────────
router.post("/api/run-serial", async (ctx: Context) => {
  const t0 = performance.now();
  if (!llm) {
    ctx.status = 503;
    ctx.body = { error: "LLM_PROVIDER 没有 Key（见 apps/.env.example）。" };
    return;
  }
  const { prompt } = ctx.request.body as { prompt?: string };
  if (!prompt?.trim()) {
    ctx.status = 400;
    ctx.body = { error: "prompt 不能为空" };
    return;
  }

  console.log(`\n[${(t0 / 1000).toFixed(2)}s] /api/run-serial 开始`);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "你可以使用工具（add / get_weather / lookup_user / search_wiki）。需要工具才能完成的不要直接猜。",
    },
    { role: "user", content: prompt },
  ];

  const MAX_ROUNDS = 5;
  const rounds: Array<{
    round: number;
    finish_reason: string | null;
    content: string | null;
    tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
    toolResults: ToolResultOut[];
  }> = [];

  try {
    let lastContent = "";
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const r = await llm.openai.chat.completions.create({
        model: llm.modelA,
        messages,
        tools: buildOpenAITools(),
      });
      const m = r.choices[0]?.message;
      const fr = r.choices[0]?.finish_reason ?? null;
      const tcs = (m?.tool_calls ?? []) as ChatCompletionMessageToolCall[];

      if (tcs.length === 0 || fr === "stop" || fr === "length" || fr === "content_filter") {
        rounds.push({
          round,
          finish_reason: fr,
          content: m?.content ?? null,
          tool_calls: tcs,
          toolResults: [],
        });
        lastContent = m?.content ?? "";
        break;
      }

      const execResults = await executeToolCalls(tcs);
      rounds.push({
        round,
        finish_reason: fr,
        content: m?.content ?? null,
        tool_calls: tcs,
        toolResults: execResults,
      });
      lastContent = m?.content ?? "";

      // 下一轮：把 model message + tool_results 都追加
      messages.push(m as ChatCompletionMessageParam, ...toolResultsToMessages(execResults));
    }

    ctx.body = {
      mode: "run-serial",
      rounds,
      finalContent: lastContent,
      totalRounds: rounds.length,
      elapsedMs: Math.round(performance.now() - t0),
    };
  } catch (err: unknown) {
    console.error(`  /api/run-serial error: ${err instanceof Error ? err.message : String(err)}`);
    writeUpstreamError(ctx, err, { mode: "run-serial" });
  }
});

// ── 11) /api/simulate-zod-error：绕过模型构造非法 arguments → repair 闭环 ─────
router.post("/api/simulate-zod-error", async (ctx: Context) => {
  const t0 = performance.now();
  if (!llm) {
    ctx.status = 503;
    ctx.body = { error: "LLM_PROVIDER 没有 Key（见 apps/.env.example）。" };
    return;
  }

  console.log(`\n[${(t0 / 1000).toFixed(2)}s] /api/simulate-zod-error 开始`);

  // 默认 prompt：让模型决定用 add 算 5+3
  const prompt = "算一下 5 加 3 等于多少";

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: "你可以使用 add 工具计算两数之和。" },
    { role: "user", content: prompt },
  ];

  try {
    // Round 1：拿到模型合法 tool_call
    const r1 = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages,
      tools: buildOpenAITools(),
    });
    const m1 = r1.choices[0]?.message;
    const tcs1 = (m1?.tool_calls ?? []) as ChatCompletionMessageToolCall[];
    if (tcs1.length === 0) {
      ctx.body = { error: "模型没调工具，没法演示（试试别的 prompt）" };
      return;
    }

    // 篡改 arguments：a 改成字符串 "not_a_number" → Zod 必失败
    const tamperedCall: ChatCompletionMessageToolCall = {
      id: tcs1[0].id,
      type: "function",
      function: {
        name: tcs1[0].function.name,
        arguments: JSON.stringify({ a: "not_a_number", b: 3 }),
      },
    };

    // 跑 executeToolCalls 走 Zod 校验路径（拿 issues 当 tool_result）
    const r1Results = await executeToolCalls([tamperedCall]);

    // Round 2：把篡改后的 assistant message + Zod 错误 tool_result 回灌，让模型修复
    //   assistant message 必须显式 role: "assistant" + tool_calls（OpenAI SDK 不允许 spread other role）
    const tamperedAssistant: ChatCompletionMessageParam = {
      role: "assistant",
      content: m1.content ?? "",
      tool_calls: [tamperedCall],
    };
    messages.push(tamperedAssistant, ...toolResultsToMessages(r1Results));
    const r2 = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages,
      tools: buildOpenAITools(),
    });
    const m2 = r2.choices[0]?.message;
    const tcs2 = (m2?.tool_calls ?? []) as ChatCompletionMessageToolCall[];
    const fr2 = r2.choices[0]?.finish_reason ?? null;

    // Round 3（如模型重新调 add）：真正执行 → Round 4 拿 stop
    let rounds: Array<{
      round: number;
      finish_reason: string | null;
      content: string | null;
      tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
      toolResults: ToolResultOut[];
      tampered?: boolean;
    }> = [];

    rounds.push({
      round: 1,
      finish_reason: r1.choices[0]?.finish_reason ?? null,
      content: m1?.content ?? null,
      tool_calls: [tamperedCall],
      toolResults: r1Results,
      tampered: true,
    });
    rounds.push({
      round: 2,
      finish_reason: fr2,
      content: m2?.content ?? null,
      tool_calls: tcs2,
      toolResults: [],
    });

    let finalContent = m2?.content ?? "";
    let totalRounds = 2;

    if (tcs2.length > 0 && fr2 !== "stop" && fr2 !== "length" && fr2 !== "content_filter") {
      const r2Results = await executeToolCalls(tcs2);
      rounds.push({
        round: 3,
        finish_reason: fr2,
        content: m2?.content ?? null,
        tool_calls: tcs2,
        toolResults: r2Results,
      });

      messages.push(m2 as ChatCompletionMessageParam, ...toolResultsToMessages(r2Results));
      const r3 = await llm.openai.chat.completions.create({
        model: llm.modelA,
        messages,
        tools: buildOpenAITools(),
      });
      const m3 = r3.choices[0]?.message;
      const fr3 = r3.choices[0]?.finish_reason ?? null;
      rounds.push({
        round: 4,
        finish_reason: fr3,
        content: m3?.content ?? null,
        tool_calls: (m3?.tool_calls ?? []) as ChatCompletionMessageToolCall[],
        toolResults: [],
      });
      finalContent = m3?.content ?? "";
      totalRounds = 4;
    }

    ctx.body = {
      mode: "simulate-zod-error",
      rounds,
      finalContent,
      totalRounds,
      elapsedMs: Math.round(performance.now() - t0),
    };
  } catch (err: unknown) {
    console.error(`  /api/simulate-zod-error error: ${err instanceof Error ? err.message : String(err)}`);
    writeUpstreamError(ctx, err, { mode: "simulate-zod-error" });
  }
});

// ── 12) 启动 ──────────────────────────────────────────────────────────────────
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 05 · 01 Function Calling 协议 Demo（§5.3 React + koa · HTTP · 仅协议 A）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  GET  /health                       → 环境信息 + 注册表 tool 列表`);
  console.log(`  GET  /tools                        → Registry 全貌（name + description + JSON Schema）`);
  console.log(`  POST /api/run                      → 完整 Round 1 → Round 2 → 终止（单/并行）`);
  console.log(`  POST /api/run-serial               → 串行多轮，最多 5 轮`);
  console.log(`  POST /api/simulate-zod-error       → 故意构造非法 arguments → repair 闭环`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});