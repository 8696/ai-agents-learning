/**
 * Adapter 层 · 协议 A vs B 统一接口
 *
 * 业务代码只需要调 sendMessage(opts)，由 adapter 决定走 OpenAI SDK 还是 Anthropic SDK。
 * adapter 返回统一格式（UnifiedResponse），业务层永远不直接碰 SDK、不看 protocol 字段。
 *
 * 关键点：
 *  - SDK 不同：A 用 `openai`，B 用 `@anthropic-ai/sdk`
 *  - system 位置：A 嵌 messages[0]={role:"system"}；B 顶层 system 参数
 *  - max_tokens：A 可选，B 必填
 *  - content 形态：A string（含 <think> 标记），B block[]
 *  - thinking 位置：A 可能是 reasoning_* 字段或 content 里的标记；B 独立 block
 *  - usage 命名：A prompt/completion，B input/output；thinking 拆分字段位置也不同
 *  - finish/stop 字段：A choices[0].finish_reason，B 顶层 stop_reason
 *
 * 适配层做的事：选 SDK → 填协议壳字段 → 调对应方法 → 把响应拆解成统一格式。
 */

import { getLlm } from "../../llm.js";

const llm = getLlm();
const aClient = llm.openai;
const bClient = llm.anthropic;

// ── 3. 统一类型（adapter 对外暴露的接口，业务代码只看到这个）──

export type Protocol = "A" | "B";

export type ThinkingConfig = {
  type: "enabled";
  budget_tokens: number;
};

export type SendMessageOptions = {
  /** 协议：A（OpenAI Chat Completions）/ B（Anthropic Messages） */
  protocol: Protocol;
  /** 用户消息 */
  message: string;
  /** system prompt（可选） */
  system?: string;
  /**
   * 不传或 true：协议 A 打 extra_body 开思考，协议 B 打顶层 thinking。
   * false：两边都不带思考参数（对照「不加思考」）。
   */
  enableThinking?: boolean;
  /** 启用思考时协议 B 的 budget；A 走 adaptive，不读这个数 */
  thinking?: ThinkingConfig;
};

/** 统一 usage（adapter 把三家四处的字段都翻译成这四个字段） */
export type UnifiedUsage = {
  /** 输入 token（protocol A: prompt_tokens / B: input_tokens） */
  inputTokens: number;
  /** 输出 token（protocol A: completion_tokens / B: output_tokens） */
  outputTokens: number;
  /** 总 token（protocol A: total_tokens / B: 自己算 input+output） */
  totalTokens: number;
  /** thinking token（仅启用 thinking 时有；protocol A: completion_tokens_details.reasoning_tokens / B: output_tokens_details.thinking_tokens） */
  thinkingTokens?: number;
  /** 缓存命中 token（可选） */
  cachedTokens?: number;
};

/** 统一响应（adapter 返回给业务的） */
export type UnifiedResponse = {
  /** 正文（已剥掉 thinking 标记） */
  content: string;
  /** thinking 内容（仅启用 thinking 且端点返回时有） */
  thinking?: string;
  /** 停止原因（protocol A: finish_reason / B: stop_reason） */
  stopReason: string;
  /** 统一 usage */
  usage: UnifiedUsage;
  /** 实际走的协议（方便调试，业务代码不要 if 分支用） */
  protocol: Protocol;
  /** 实际用的模型（方便调试） */
  model: string;
};

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

type ProtocolADelta = {
  content?: string | null;
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: Array<{ text?: string }>;
  thinking?: string;
};

// ── 4. helper：协议 A 思考可能在独立字段，也可能嵌在 content 的标记里 ──
function extractThinkFromString(content: string): {
  thinking?: string;
  answer: string;
} {
  const thinkRe = /<think>([\s\S]*?)<\/think>/g;
  let thinking = "";
  let answer = "";
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = thinkRe.exec(content)) !== null) {
    answer += content.slice(lastIdx, m.index);
    thinking += m[1];
    lastIdx = m.index + m[0].length;
  }
  answer += content.slice(lastIdx);
  return {
    thinking: thinking || undefined,
    answer: answer.trim(),
  };
}

function reasoningTextFromDelta(delta: ProtocolADelta): string {
  const fromDetails: string[] = [];
  if (Array.isArray(delta.reasoning_details)) {
    for (const detail of delta.reasoning_details) {
      if (typeof detail?.text === "string" && detail.text) fromDetails.push(detail.text);
    }
  }
  if (fromDetails.length > 0) return fromDetails.join("");
  if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
    return delta.reasoning_content;
  }
  if (typeof delta.reasoning === "string" && delta.reasoning) return delta.reasoning;
  if (typeof delta.thinking === "string" && delta.thinking) return delta.thinking;
  return "";
}

function extractThinkFromProtocolAMessage(message: ProtocolADelta): {
  thinking?: string;
  answer: string;
} {
  const split = reasoningTextFromDelta(message);
  const content = typeof message.content === "string" ? message.content : "";
  if (split) {
    return { thinking: split, answer: content.trim() };
  }
  return extractThinkFromString(content);
}

/** 流式：有拆分字段时 content 当正文；没有时才用标记状态机切 content。 */
function splitProtocolADelta(
  delta: ProtocolADelta,
  state: { inThink: boolean; reasoningSeen: string },
): { thinking: string; content: string } {
  const split = reasoningTextFromDelta(delta);
  if (split) {
    let thinking = "";
    if (split.startsWith(state.reasoningSeen)) {
      thinking = split.slice(state.reasoningSeen.length);
      state.reasoningSeen = split;
    } else {
      thinking = split;
      state.reasoningSeen += split;
    }
    return { thinking, content: typeof delta.content === "string" ? delta.content : "" };
  }

  const raw = typeof delta.content === "string" ? delta.content : "";
  if (!raw) return { thinking: "", content: "" };

  let thinking = "";
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
  return { thinking, content };
}

/** 与 05-思考同一套：协议 A 主动开思考并拆字段。不传 budget 也要开，否则换模型就看不见思考。 */
const PROTOCOL_A_THINKING = {
  temperature: 1,
  max_tokens: 2048,
  extra_body: {
    thinking: { type: "adaptive" as const },
    reasoning_split: true,
    service_tier: "standard" as const,
  },
};

function thinkingEnabled(opts: SendMessageOptions): boolean {
  return opts.enableThinking !== false;
}

// ── 5. adapter 入口（业务代码只调这个）──
export async function sendMessage(
  opts: SendMessageOptions,
): Promise<UnifiedResponse> {
  if (opts.protocol === "A") return sendViaA(opts);
  return sendViaB(opts);
}

// ── 6. 协议 A 实现 ──
//
// 不同点处理：
//   - system 放 messages[0]
//   - 不传 max_tokens（可选）
//   - thinking 是 MiniMax 自己的"嵌字符串"模式，不传 thinking 参数
//   - 返回 choices[0].message.content（string）+ choices[0].finish_reason
//   - usage: prompt_tokens / completion_tokens / total_tokens
//   - reasoning_tokens 嵌在 completion_tokens_details 里
async function sendViaA(opts: SendMessageOptions): Promise<UnifiedResponse> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.message });

  const r = await aClient.chat.completions.create({
    model: llm.modelA,
    messages,
    stream: false,
    ...(thinkingEnabled(opts) ? PROTOCOL_A_THINKING : {}),
  });

  // plain 化（zod 实例）
  const plain = JSON.parse(JSON.stringify(r));
  const message = (plain.choices?.[0]?.message ?? {}) as ProtocolADelta;
  const { thinking, answer } = extractThinkFromProtocolAMessage(message);
  const u = plain.usage ?? {};

  return {
    content: answer,
    thinking,
    stopReason: plain.choices?.[0]?.finish_reason ?? "unknown",
    usage: {
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
      totalTokens:
        u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      thinkingTokens: u.completion_tokens_details?.reasoning_tokens,
      cachedTokens: u.prompt_tokens_details?.cached_tokens,
    },
    protocol: "A",
    model: llm.modelA,
  };
}

// ── 7. 协议 B 实现 ──
//
// 不同点处理：
//   - system 放顶层参数（不在 messages 里）
//   - max_tokens 必填（如果启用 thinking，还要 ≥ budget_tokens）
//   - thinking 参数控制是否启用 extended thinking block
//   - 返回 content 是 block[]：type="text" 是正文，type="thinking" 是思考
//   - usage: input_tokens / output_tokens（无 total_tokens，自己算）
//   - stop_reason 在顶层
//   - thinking 拆分字段：output_tokens_details.thinking_tokens（MiniMax 兼容端点位置）
async function sendViaB(opts: SendMessageOptions): Promise<UnifiedResponse> {
  const thinkingOn = thinkingEnabled(opts);
  const thinkingCfg = opts.thinking ?? { type: "enabled" as const, budget_tokens: 1024 };
  const maxTokens = thinkingOn
    ? Math.max(thinkingCfg.budget_tokens + 1024, llm.maxTokensB, 2048)
    : llm.maxTokensB;

  const r = await bClient.messages.create({
    model: llm.modelB,
    system: opts.system,
    max_tokens: maxTokens,
    ...(thinkingOn ? { temperature: 1 as const, thinking: thinkingCfg } : {}),
    messages: [{ role: "user", content: opts.message }],
  });

  // plain 化（zod 实例）
  const plain = JSON.parse(JSON.stringify(r));
  const blocks: Array<{ type: string; text?: string; thinking?: string }> =
    plain.content ?? [];
  const textAnswer = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const thinkingText = blocks
    .filter((b) => b.type === "thinking")
    .map((b) => b.thinking ?? "")
    .join("");
  const u = plain.usage ?? {};

  return {
    content: textAnswer,
    thinking: thinkingText || undefined,
    stopReason: plain.stop_reason ?? "unknown",
    usage: {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      thinkingTokens: u.output_tokens_details?.thinking_tokens,
      cachedTokens: u.cache_read_input_tokens,
    },
    protocol: "B",
    model: llm.modelB,
  };
}

// ── 8. 流式版本 ──
//
// 业务代码用 for await 逐块接收 unified delta，不用关心协议。
// UnifiedDelta 是 discriminated union，业务只 switch type：
//
//   for await (const d of sendMessageStream(opts)) {
//     switch (d.type) {
//       case "thinking": /* d.text */ break;
//       case "content":  /* d.text */ break;
//       case "usage":    /* d.usage + d.stopReason */ break;
//       case "done":     /* 流结束 */ break;
//     }
//   }
//
// 协议 A：OpenAI 字符串帧流 → 提取 delta.content → 正则抽 <think> → yield thinking/content
// 协议 B：Anthropic 事件流 → 监听 streamEvent 事件 → 分类 → yield thinking/content/usage
export type UnifiedDelta =
  | { type: "thinking"; text: string }
  | { type: "content"; text: string }
  | { type: "usage"; usage: UnifiedUsage; stopReason: string; protocol: Protocol; model: string }
  | { type: "done" };

export async function* sendMessageStream(
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
  if (opts.protocol === "A") {
    yield* sendViaAStream(opts);
  } else {
    yield* sendViaBStream(opts);
  }
}

// 协议 A 流式：OpenAI chunk 字符串帧流
// 关键差异：
//   - chunk JSON 是 choices[0].delta.content（string）
//   - thinking 嵌在 content 字符串里，要正则提取 <think>...</think>
//   - finish_reason 出现在中间某一帧
//   - usage 在最后一帧（需 stream_options.include_usage: true）
async function* sendViaAStream(
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.message });

  const stream = await aClient.chat.completions.create({
    model: llm.modelA,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(thinkingEnabled(opts) ? PROTOCOL_A_THINKING : {}),
  });

  const state = { inThink: false, reasoningSeen: "" };
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
    prompt_tokens_details?: { cached_tokens?: number } } | null = null;
  let stopReason = "unknown";

  for await (const chunk of stream) {
    const plain = JSON.parse(JSON.stringify(chunk));
    const delta = (plain.choices?.[0]?.delta ?? {}) as ProtocolADelta;
    const finishReason = plain.choices?.[0]?.finish_reason;
    if (plain.usage) usage = plain.usage;
    if (finishReason) stopReason = finishReason;

    const split = splitProtocolADelta(delta, state);
    if (split.thinking) yield { type: "thinking", text: split.thinking };
    if (split.content) yield { type: "content", text: split.content };
  }

  if (usage) {
    yield {
      type: "usage",
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
        thinkingTokens: usage.completion_tokens_details?.reasoning_tokens,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens,
      },
      stopReason,
      protocol: "A",
      model: llm.modelA,
    };
  }
  yield { type: "done" };
}

// 协议 B 流式：Anthropic 事件流
// 关键差异：
//   - 不是字符串帧流，是事件流（message_start / content_block_start / content_block_delta / ...）
//   - thinking 在独立 block（type:"thinking"），不在 content 字符串里
//   - usage 在 message_delta.usage 里（流式 MiniMax 不报 thinking 拆分）
//   - 结束是 message_stop 事件
//   - SDK 是 callback 模型（on("streamEvent")），不是 async iterator
//     → 用事件队列 + Promise 桥接成 async generator
async function* sendViaBStream(
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
  const thinkingOn = thinkingEnabled(opts);
  const thinkingCfg = opts.thinking ?? { type: "enabled" as const, budget_tokens: 1024 };
  const maxTokens = thinkingOn
    ? Math.max(thinkingCfg.budget_tokens + 1024, llm.maxTokensB, 2048)
    : llm.maxTokensB;

  const stream = bClient.messages.stream({
    model: llm.modelB,
    system: opts.system,
    max_tokens: maxTokens,
    ...(thinkingOn ? { temperature: 1 as const, thinking: thinkingCfg } : {}),
    messages: [{ role: "user", content: opts.message }],
  });

  // 事件队列 + Promise 桥接：把 SDK 的 callback 模型 → async generator
  const queue: unknown[] = [];
  let waiter: (() => void) | null = null;
  let ended = false;

  stream.on("streamEvent", (evt: unknown) => {
    queue.push(evt);
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  });
  stream.on("error", (err: unknown) => {
    ended = true;
    queue.push({ type: "_error", error: err });
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  });
  stream.on("end", () => {
    ended = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  });

  let usage: { input_tokens?: number; output_tokens?: number;
    output_tokens_details?: { thinking_tokens?: number };
    cache_read_input_tokens?: number } | null = null;
  let stopReason = "unknown";

  while (true) {
    // 队列空就等下一个事件
    if (queue.length === 0 && !ended) {
      await new Promise<void>((resolve) => {
        waiter = resolve;
      });
    }
    if (queue.length === 0 && ended) break;
    const evt = queue.shift() as { type: string; [k: string]: unknown };

    // 内部错误事件
    if (evt.type === "_error") {
      throw (evt as { type: string; error?: unknown }).error;
    }

    const plain = JSON.parse(JSON.stringify(evt));
    const type = plain.type;

    if (type === "content_block_delta") {
      const d = plain.delta || {};
      // 流式 B：delta.type 是 "thinking_delta" / "text_delta"；字段是 thinking / text
      if (d.thinking != null) {
        yield { type: "thinking", text: d.thinking };
      } else if (d.text != null) {
        yield { type: "content", text: d.text };
      }
    } else if (type === "message_delta") {
      if (plain.delta?.stop_reason) stopReason = plain.delta.stop_reason;
      if (plain.usage) usage = { ...(usage || {}), ...plain.usage };
    } else if (type === "message_start") {
      // Anthropic 官方在 message_start 也可能带 usage；MiniMax 兼容端点也可能
      if (plain.message?.usage) usage = { ...(usage || {}), ...plain.message.usage };
    } else if (type === "message_stop") {
      break;
    }
  }

  // 等 SDK 流结束（确保 finalMessage 完成）
  await stream.finalMessage().catch(() => undefined);

  if (usage) {
    yield {
      type: "usage",
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        // 流式 MiniMax 兼容端点不报 output_tokens_details.thinking_tokens
        // （这是 streaming-sse demo 实测发现的 quirk）
        thinkingTokens: usage.output_tokens_details?.thinking_tokens,
        cachedTokens: usage.cache_read_input_tokens,
      },
      stopReason,
      protocol: "B",
      model: llm.modelB,
    };
  }
  yield { type: "done" };
}
