/**
 * 模块 02 · 05 思考 · Demo（§5.3 React + koa）
 *
 * 职责：按 MiniMax-M3 / glm-5.3 / deepseek-v4-pro 各自官方方言开/关思考，
 *       协议 A、B 流式把思考 / 正文拆开推到页面；UI 先展示官方字段，再标这一轮实测位置。
 *   GET  /                 public/index.html
 *   GET  /health           四家是否就绪 + 官方方言卡片
 *   POST /api/stream       { provider, protocol, thinking_on, messages, … } SSE
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
import {
  getCatalogLabel,
  getLlmForProvider,
  listProductionLlms,
  PRODUCTION_PROVIDER_IDS,
  type Llm,
  type ProductionProviderId,
} from "../../llm.js";
import {
  officialCards,
  planProtocolA,
  planProtocolB,
  type DialectCard,
} from "./thinking-dialect.js";

const PORT = z.coerce.number().int().positive().default(50205).parse(process.env.PORT);

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  thinking: z.string().optional(),
});

const bodySchema = z.object({
  provider: z.enum(PRODUCTION_PROVIDER_IDS),
  protocol: z.enum(["A", "B"]),
  thinking_on: z.boolean().default(true),
  reasoning_split: z.boolean().default(true),
  message: z.string().optional(),
  system: z.string().optional(),
  messages: z.array(turnSchema).optional(),
});

type ChatTurn = z.infer<typeof turnSchema>;
type StreamBody = {
  provider: ProductionProviderId;
  protocol: "A" | "B";
  thinkingOn: boolean;
  reasoningSplit: boolean;
  system: string;
  messages: ChatTurn[];
};

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

function parseBody(ctx: Context): StreamBody | null {
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
    provider: parsed.data.provider,
    protocol: parsed.data.protocol,
    thinkingOn: parsed.data.thinking_on,
    reasoningSplit: parsed.data.reasoning_split,
    system: parsed.data.system?.trim() || "你是严谨的助手。先想清楚，再给结论。",
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
  const ready = listProductionLlms();
  const readyIds = new Set(ready.map((item) => item.provider));
  ctx.body = {
    ok: true,
    port: PORT,
    providers: PRODUCTION_PROVIDER_IDS.map((id) => {
      const llm = getLlmForProvider(id);
      const cards = officialCards(id);
      return {
        id,
        label: getCatalogLabel(id),
        ready: readyIds.has(id),
        modelA: llm?.modelA ?? "",
        modelB: llm?.modelB ?? "",
        baseUrlA: llm?.baseUrlA ?? "",
        baseUrlB: llm?.baseUrlB ?? "",
        dialect: { a: cards.a, b: cards.b },
      };
    }),
  };
});

router.post("/api/stream", async (ctx: Context, _next: Next) => {
  const body = parseBody(ctx);
  if (!body) return;
  const llm = getLlmForProvider(body.provider);
  if (!llm) {
    ctx.status = 400;
    ctx.body = { error: `提供商 ${body.provider} 没有 Key 或模型 id，请检查 apps/.env 对应分组` };
    return;
  }
  ctx.respond = false;
  if (body.protocol === "A") {
    await streamProtocolA(llm, body, ctx.res);
  } else {
    await streamProtocolB(llm, body, ctx.res);
  }
});

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

function assistantMessageA(provider: ProductionProviderId, turn: ChatTurn): Record<string, unknown> {
  const thinking = turn.thinking?.trim() ?? "";
  const content = turn.content.trim() || "（这一轮没有正文）";
  if (provider === "minimax") {
    if (!thinking) return { role: "assistant", content };
    return {
      role: "assistant",
      content: `${THINK_OPEN}${thinking}${THINK_CLOSE}\n${content}`,
      reasoning_content: thinking,
    };
  }
  return {
    role: "assistant",
    content,
    ...(thinking ? { reasoning_content: thinking } : {}),
  };
}

function buildMessagesA(provider: ProductionProviderId, system: string, turns: ChatTurn[]) {
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else {
      messages.push(assistantMessageA(provider, turn));
    }
  }
  return messages;
}

function buildMessagesB(turns: ChatTurn[]) {
  return turns.map((turn) => ({
    role: turn.role,
    content: turn.role === "assistant" ? (turn.content.trim() || "（这一轮没有正文）") : turn.content,
  }));
}

function switchSnippetA(extraBody: Record<string, unknown> | undefined): unknown {
  return extraBody ?? null;
}

function switchSnippetB(plan: { thinking?: Record<string, unknown>; outputConfig?: { effort: string } }): unknown {
  const out: Record<string, unknown> = {};
  if (plan.thinking) out.thinking = plan.thinking;
  if (plan.outputConfig) out.output_config = plan.outputConfig;
  return Object.keys(out).length > 0 ? out : { "(未传思考字段)": "靠这家默认行为" };
}

type ThinkingSourceA = "reasoning_details" | "reasoning_content" | "content_think_tag";

function classifyReturnShape(sources: string[]): "separate_field" | "in_content" | "both" | "none" {
  const separate = sources.some(
    (s) => s === "reasoning_details" || s === "reasoning_content" || s === "delta.thinking",
  );
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
  while (cursor < raw.length) {
    if (state.inThink) {
      const endIdx = raw.indexOf(THINK_CLOSE, cursor);
      if (endIdx === -1) {
        thinking += raw.slice(cursor);
        break;
      }
      thinking += raw.slice(cursor, endIdx);
      cursor = endIdx + THINK_CLOSE.length;
      state.inThink = false;
    } else {
      const startIdx = raw.indexOf(THINK_OPEN, cursor);
      if (startIdx === -1) {
        content += raw.slice(cursor);
        break;
      }
      content += raw.slice(cursor, startIdx);
      cursor = startIdx + THINK_OPEN.length;
      state.inThink = true;
    }
  }
  return { thinking, content, source: thinking ? "content_think_tag" : null };
}

function writeMeta(
  res: ServerResponse,
  opts: {
    llm: Llm;
    protocol: "A" | "B";
    request: unknown;
    explain: DialectCard;
    switchSnippet: unknown;
    skipped?: string;
  },
): boolean {
  return writeSse(res, {
    type: "meta",
    protocol: opts.protocol,
    provider: opts.llm.provider,
    label: getCatalogLabel(opts.llm.provider),
    sdk: opts.protocol === "A" ? "openai" : "@anthropic-ai/sdk",
    method: opts.protocol === "A" ? "chat.completions.create" : "messages.stream",
    baseURL: opts.protocol === "A" ? opts.llm.baseUrlA : opts.llm.baseUrlB,
    model: opts.protocol === "A" ? opts.llm.modelA : opts.llm.modelB,
    request: opts.request,
    skipped: Boolean(opts.skipped),
    skipReason: opts.skipped ?? "",
    thinkingExplain: {
      howEnabled: opts.explain.howOn,
      howDisabled: opts.explain.howOff,
      defaultOn: opts.explain.defaultOn,
      canDisable: opts.explain.canDisable,
      returnField: opts.explain.returnField,
      notes: opts.explain.notes,
    },
    switchSnippet: opts.switchSnippet,
  });
}

async function streamProtocolA(llm: Llm, body: StreamBody, res: ServerResponse): Promise<void> {
  const plan = planProtocolA(body.provider, body.thinkingOn, body.reasoningSplit);
  const messages = buildMessagesA(body.provider, body.system, body.messages);
  const request: Record<string, unknown> = {
    model: llm.modelA,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 4096,
  };
  if (!plan.omitSampling) {
    request.temperature = 1;
  }
  if (plan.extraBody) {
    request.extra_body = plan.extraBody;
  }

  openSse(res);
  if (!writeMeta(res, {
    llm,
    protocol: "A",
    request,
    explain: plan.explain,
    switchSnippet: switchSnippetA(plan.extraBody),
    skipped: plan.skip,
  })) {
    return;
  }
  if (plan.skip) {
    writeSse(res, { type: "thinking-map", sources: [], returnShape: "none", skipped: true });
    endSse(res);
    return;
  }

  const state = { inThink: false, reasoningSeen: "" };
  const sources: string[] = [];
  try {
    const stream = (await llm.openai.chat.completions.create(request as never)) as unknown as AsyncIterable<unknown>;
    for await (const chunk of stream) {
      const plain = toPlain(chunk);
      if (!writeSse(res, { type: "raw", frame: plain })) return;
      const rec = plain as {
        usage?: unknown;
        choices?: Array<{
          delta?: {
            content?: string;
            reasoning_content?: string;
            reasoning_details?: Array<{ text?: string }>;
          };
          finish_reason?: string;
        }>;
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

async function streamProtocolB(llm: Llm, body: StreamBody, res: ServerResponse): Promise<void> {
  const plan = planProtocolB(body.provider, body.thinkingOn);
  const maxTokens = Math.max(llm.maxTokensB, 4096);
  const request: Record<string, unknown> = {
    model: llm.modelB,
    max_tokens: maxTokens,
    temperature: 1,
    system: body.system,
    messages: buildMessagesB(body.messages),
  };
  if (plan.thinking) request.thinking = plan.thinking;
  if (plan.outputConfig) request.output_config = plan.outputConfig;

  openSse(res);
  if (!writeMeta(res, {
    llm,
    protocol: "B",
    request,
    explain: plan.explain,
    switchSnippet: switchSnippetB(plan),
    skipped: plan.skip,
  })) {
    return;
  }
  if (plan.skip) {
    writeSse(res, { type: "thinking-map", sources: [], returnShape: "none", skipped: true });
    endSse(res);
    return;
  }

  const sources: string[] = [];
  try {
    const stream = llm.anthropic.messages.stream(
      request as unknown as Parameters<Llm["anthropic"]["messages"]["stream"]>[0],
    );
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
  console.log("──── 02 · 05 思考 · 四家官方方言 × 协议 A/B（§5.3 React + koa）────");
  console.log(`  浏览器打开: http://127.0.0.1:${PORT}/`);
  console.log("  POST /api/stream  GET /health");
  const ready = listProductionLlms();
  if (ready.length === 0) {
    console.log("  未检测到 MiniMax / 智谱 / DeepSeek 的 Key");
  } else {
    for (const llm of ready) {
      console.log(`  ${getCatalogLabel(llm.provider)}  A ${llm.modelA}  B ${llm.modelB}`);
    }
  }
  console.log("  Ctrl+C 退出");
});
