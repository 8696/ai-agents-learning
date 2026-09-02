/**
 * 模块 02 · 05 思考 · Demo（§5.3 React + koa）
 *
 * 职责：同 prompt 并发打满两套协议参数并开启思考；流式把思考 / 正文拆开推到页面，
 *       同时把发给 SDK 的请求体和每一帧原始 JSON 摊开；支持按协议分历史追问。
 *   GET  /                 public/index.html
 *   GET  /health           { ok, a, b, port }
 *   POST /api/a-stream     协议 A SSE（messages 含多轮）
 *   POST /api/b-stream     协议 B SSE（messages 含多轮）
 *
 * 入口：yarn app:02-05-thinking → tsx server.ts
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import type { Context, Next } from "koa";
import type { ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { getLlm, logLlmConfig } from "../../llm.js";

const llm = getLlm();
const PORT = z.coerce.number().int().positive().default(50205).parse(process.env.PORT);

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  thinking: z.string().optional(),
});

const bodySchema = z.object({
  /** 兼容第一轮只发一句；有 messages 时以 messages 为准 */
  message: z.string().optional(),
  system: z.string().optional(),
  thinking_budget: z.number().int().positive().default(1024),
  messages: z.array(turnSchema).optional(),
});

type ChatTurn = z.infer<typeof turnSchema>;
type Body = { system: string; thinking_budget: number; messages: ChatTurn[] };

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

function resolveMessages(parsed: z.infer<typeof bodySchema>): ChatTurn[] | null {
  if (parsed.messages && parsed.messages.length > 0) {
    return parsed.messages;
  }
  const one = parsed.message?.trim() ?? "";
  if (!one) return null;
  return [{ role: "user", content: one }];
}

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function parseBody(ctx: Context): Body | null {
  const parsed = bodySchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: `请求体不合法: ${parsed.error.message}` };
    return null;
  }
  const messages = resolveMessages(parsed.data);
  if (!messages || messages[messages.length - 1]?.role !== "user") {
    ctx.status = 400;
    ctx.body = { error: "请求体不合法: 需要至少一条 user 消息，且最后一轮必须是 user（才能追问）" };
    return null;
  }
  return {
    system: parsed.data.system?.trim() || "你是严谨的助手。先想清楚，再给结论。",
    thinking_budget: parsed.data.thinking_budget,
    messages,
  };
}

function writeSse(res: ServerResponse, payload: unknown): boolean {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function endSse(res: ServerResponse): void {
  try {
    res.write("data: [DONE]\n\n");
    res.end();
  } catch {
    /* ignore */
  }
}

function openSse(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
}

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    port: PORT,
    provider: llm.provider,
    a: { model: llm.modelA, baseURL: llm.baseUrlA, sdk: "openai" },
    b: {
      model: llm.modelB,
      baseURL: llm.baseUrlB,
      sdk: "@anthropic-ai/sdk",
      maxTokens: llm.maxTokensB,
    },
  };
});

router.post("/api/a-stream", async (ctx: Context, _next: Next) => {
  const body = parseBody(ctx);
  if (!body) return;
  ctx.respond = false;
  await streamProtocolA(body, ctx.res);
});

router.post("/api/b-stream", async (ctx: Context, _next: Next) => {
  const body = parseBody(ctx);
  if (!body) return;
  ctx.respond = false;
  await streamProtocolB(body, ctx.res);
});

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

function assistantContentForA(turn: ChatTurn): string {
  const thinking = turn.thinking?.trim() ?? "";
  const content = turn.content.trim() || "（这一轮没有正文）";
  if (!thinking) return content;
  return `${THINK_OPEN}${thinking}${THINK_CLOSE}\n${content}`;
}

function buildRequestA(system: string, turns: ChatTurn[]) {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: system },
  ];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else {
      messages.push({ role: "assistant", content: assistantContentForA(turn) });
    }
  }
  return {
    model: llm.modelA,
    messages,
    stream: true as const,
    stream_options: { include_usage: true },
    n: 1,
    temperature: 1,
    top_p: 0.95,
    max_tokens: 2048,
    max_completion_tokens: 2048,
    presence_penalty: 0,
    frequency_penalty: 0,
    user: "full-params-think-demo",
    extra_body: {
      thinking: { type: "adaptive" as const },
      reasoning_split: true,
      service_tier: "standard" as const,
    },
  };
}

function buildRequestB(system: string, turns: ChatTurn[], thinkingBudget: number) {
  const maxTokens = Math.max(thinkingBudget + 1024, llm.maxTokensB, 2048);
  return {
    model: llm.modelB,
    max_tokens: maxTokens,
    temperature: 1,
    system,
    thinking: { type: "enabled" as const, budget_tokens: thinkingBudget },
    metadata: { user_id: "full-params-think-demo" },
    // 协议 B 追问：历史 assistant 只回传正文。没有 signature 的 thinking block 再塞回去会被拒。
    messages: turns.map((turn) => ({
      role: turn.role,
      content: turn.role === "assistant" ? (turn.content.trim() || "（这一轮没有正文）") : turn.content,
    })),
  };
}

type ThinkingSourceA = "reasoning_details" | "reasoning_content" | "content_think_tag";

function classifyReturnShape(sources: string[]): "separate_field" | "in_content" | "both" | "none" {
  const separate = sources.some((s) => s === "reasoning_details" || s === "reasoning_content" || s === "delta.thinking");
  const inContent = sources.includes("content_think_tag");
  if (separate && inContent) return "both";
  if (separate) return "separate_field";
  if (inContent) return "in_content";
  return "none";
}

/**
 * 协议 A 思考可能出现在三处：reasoning_content、reasoning_details、content 里的 think 标记。
 * 有拆分字段时，content 当正文；没有拆分时才用标记状态机切 content。
 */
function splitProtocolADelta(
  delta: {
    content?: string;
    reasoning_content?: string;
    reasoning_details?: Array<{ text?: string }>;
  },
  state: { inThink: boolean; reasoningSeen: string },
): { thinking: string; content: string; source: ThinkingSourceA | null } {
  let thinking = "";
  const splitPieces: string[] = [];
  let splitSource: ThinkingSourceA | null = null;
  if (Array.isArray(delta.reasoning_details) && delta.reasoning_details.length > 0) {
    for (const detail of delta.reasoning_details) {
      if (typeof detail?.text === "string" && detail.text) splitPieces.push(detail.text);
    }
    if (splitPieces.length > 0) splitSource = "reasoning_details";
  } else if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
    splitPieces.push(delta.reasoning_content);
    splitSource = "reasoning_content";
  }

  if (splitPieces.length > 0) {
    for (const piece of splitPieces) {
      if (piece.startsWith(state.reasoningSeen)) {
        thinking += piece.slice(state.reasoningSeen.length);
        state.reasoningSeen = piece;
      } else {
        thinking += piece;
        state.reasoningSeen += piece;
      }
    }
    return {
      thinking,
      content: typeof delta.content === "string" ? delta.content : "",
      source: thinking ? splitSource : null,
    };
  }

  const raw = typeof delta.content === "string" ? delta.content : "";
  if (!raw) return { thinking: "", content: "", source: null };

  let content = "";
  let cursor = 0;
  const open = THINK_OPEN;
  const close = THINK_CLOSE;
  while (cursor < raw.length) {
    if (state.inThink) {
      const endIdx = raw.indexOf(close, cursor);
      if (endIdx === -1) {
        thinking += raw.slice(cursor);
        break;
      }
      thinking += raw.slice(cursor, endIdx);
      cursor = endIdx + close.length;
      state.inThink = false;
    } else {
      const startIdx = raw.indexOf(open, cursor);
      if (startIdx === -1) {
        content += raw.slice(cursor);
        break;
      }
      content += raw.slice(cursor, startIdx);
      cursor = startIdx + open.length;
      state.inThink = true;
    }
  }
  return { thinking, content, source: thinking ? "content_think_tag" : null };
}

async function streamProtocolA(body: Body, res: ServerResponse): Promise<void> {
  const request = buildRequestA(body.system, body.messages);
  openSse(res);
  if (!writeSse(res, {
    type: "meta",
    protocol: "A",
    sdk: "openai",
    method: "chat.completions.create",
    baseURL: llm.baseUrlA,
    model: llm.modelA,
    request,
    thinkingExplain: {
      howEnabled: "Chat Completions 顶层没有 thinking。MiniMax 走 extra_body：thinking.type = adaptive。",
      switchPath: "request.extra_body.thinking",
      splitPath: "request.extra_body.reasoning_split",
      splitMeaning: "true = 思考应出现在独立字段；false / 网关不拆分 = 可能嵌在 content 的 think 标记里。",
      possibleReturns: [
        "choices[0].delta.reasoning_details[].text（独立字段）",
        "choices[0].delta.reasoning_content（独立字段）",
        "choices[0].delta.content 里的 <think>…</think>（嵌在正文）",
      ],
    },
  })) {
    return;
  }

  const state = { inThink: false, reasoningSeen: "" };
  const sources: string[] = [];
  try {
    const stream = await llm.openai.chat.completions.create(request);
    for await (const chunk of stream) {
      const plain = toPlain(chunk);
      if (!writeSse(res, { type: "raw", frame: plain })) return;
      const rec = plain as {
        usage?: unknown;
        choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning_details?: Array<{ text?: string }> }; finish_reason?: string }>;
      };
      const delta = rec.choices?.[0]?.delta ?? {};
      const split = splitProtocolADelta(delta, state);
      if (split.source && !sources.includes(split.source)) sources.push(split.source);
      if (split.thinking && !writeSse(res, { type: "thinking", text: split.thinking, source: split.source })) return;
      if (split.content && !writeSse(res, { type: "content", text: split.content })) return;
      if (rec.usage && !writeSse(res, { type: "usage", usage: rec.usage, finish_reason: rec.choices?.[0]?.finish_reason ?? null })) {
        return;
      }
    }
    writeSse(res, {
      type: "thinking-map",
      sources,
      returnShape: classifyReturnShape(sources),
    });
    endSse(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSse(res, { type: "error", error: msg });
    endSse(res);
  }
}

async function streamProtocolB(body: Body, res: ServerResponse): Promise<void> {
  const request = buildRequestB(body.system, body.messages, body.thinking_budget);
  openSse(res);
  if (!writeSse(res, {
    type: "meta",
    protocol: "B",
    sdk: "@anthropic-ai/sdk",
    method: "messages.stream",
    baseURL: llm.baseUrlB,
    model: llm.modelB,
    request,
    thinkingExplain: {
      howEnabled: "顶层 thinking: { type: enabled, budget_tokens }。默认关；temperature 必须是 1。",
      switchPath: "request.thinking",
      splitPath: null,
      splitMeaning: "协议 B 没有 reasoning_split：思考永远是独立 content block，不会嵌进 text。",
      possibleReturns: [
        "content_block_delta.delta.thinking（独立字段）",
        "content_block_delta.delta.text（正文，另一条增量）",
      ],
    },
  })) {
    return;
  }

  const sources: string[] = [];
  try {
    const stream = llm.anthropic.messages.stream(request);
    stream.on("streamEvent", (evt: unknown) => {
      const plain = toPlain(evt) as {
        type?: string;
        delta?: { thinking?: string; text?: string };
        usage?: unknown;
      };
      writeSse(res, { type: "raw", frame: plain });
      if (plain.type === "content_block_delta") {
        const d = plain.delta ?? {};
        if (d.thinking != null) {
          if (!sources.includes("delta.thinking")) sources.push("delta.thinking");
          writeSse(res, { type: "thinking", text: d.thinking, source: "delta.thinking" });
        } else if (d.text != null) writeSse(res, { type: "content", text: d.text });
      } else if (plain.type === "message_delta" && plain.usage) {
        writeSse(res, { type: "usage", usage: plain.usage });
      }
    });
    await stream.finalMessage();
    writeSse(res, {
      type: "thinking-map",
      sources,
      returnShape: classifyReturnShape(sources),
    });
    endSse(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSse(res, { type: "error", error: msg });
    endSse(res);
  }
}

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 02 · 05 思考 · 协议 A vs B 流式（§5.3 React + koa）────");
  console.log(`  浏览器打开: http://127.0.0.1:${PORT}/`);
  console.log("  POST /api/a-stream  POST /api/b-stream  Body: { messages:[{role,content,thinking?}], system?, thinking_budget? }");
  console.log("  GET  /health");
  logLlmConfig(llm);
  console.log("  Ctrl+C 退出");
});
