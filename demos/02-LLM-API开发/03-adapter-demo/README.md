# Demo · Adapter 层（协议 A vs B 统一调用）

对应：[模块 02 · LLM API 开发](../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md)

## 本条必须看见的

1. **业务代码完全不碰 SDK** —— 只调 `sendMessage({protocol, message, system?, thinking?})`
2. **adapter 内部按 protocol 路由**到 `openai` 包 或 `@anthropic-ai/sdk`
3. **adapter 返回统一格式**（`UnifiedResponse`）—— 跨协议字段名对齐（`inputTokens` / `outputTokens` / `thinkingTokens` / `cachedTokens`）
4. **三处 thinking 字段位置统一翻译** ——
   - 协议 A：`completion_tokens_details.reasoning_tokens`
   - 协议 B 一次性（MiniMax 兼容）：`output_tokens_details.thinking_tokens`
   - Anthropic 官方：`usage.reasoning_tokens`（顶层）
5. **system / max_tokens / content 形态 / 停止字段** 全部在 adapter 内部翻译，业务层看不到
6. **流式版本** `sendMessageStream(opts)` 返回 `AsyncGenerator<UnifiedDelta>`，业务 `for await` 拿 unified delta，**不知道也不需要知道是 A 还是 B**

## 跑法

```bash
cd demos
yarn install
yarn demo:02-adapter
```

浏览器打开 `http://127.0.0.1:5175/`，**两个面板**：

- **上面「一次性调用 adapter.sendMessage」**——4 个控件（协议 / thinking budget / system / 消息）+ 4 块显示区（thinking / answer / usage / 原始 JSON）。点按钮拿到完整 unified response。
- **下面「流式调用 adapter.sendMessageStream」**——同样 4 控件 + 3 块显示区（thinking 累加 / content 累加 / usage）+ 1 块 unified delta 日志。点按钮逐块 yield unified delta。

切换「协议」下拉框在 A / B 之间：

- **A**：OpenAI Chat Completions（`openai` 包 + `/v1`）
- **B**：Anthropic Messages（`@anthropic-ai/sdk` + `/anthropic`）

thinking_budget 输入框填数字（默认 500）—— A 端点忽略（thinking 总是有），B 端点启用 extended thinking。

后端控制台会打印 adapter 走的协议和模型。

## 文件结构

```
03-adapter-demo/
├── adapter.ts           ← Adapter 层：types + sendViaA + sendViaB + sendMessage（一次性）+ sendMessageStream + sendViaAStream + sendViaBStream（流式）
├── index.ts             ← HTTP server（POST /api/chat 一次性 + POST /api/chat-stream 流式；零业务逻辑）
├── public/
│   └── index.html       ← 前端（一次性面板 + 流式面板，4 控件 + 显示区）
└── README.md
```

## adapter 暴露的统一接口（业务代码只看这个）

```ts
import { sendMessage, type SendMessageOptions, type UnifiedResponse } from "./adapter.js";

// 业务代码：
const r: UnifiedResponse = await sendMessage({
  protocol: "A" | "B",                    // 选协议
  message: "你好",
  system: "你是简洁的助手。",             // 可选
  thinking: { type: "enabled", budget_tokens: 500 },  // 可选
});

// r 的字段（业务代码永远只看这些）：
r.content          // 正文（已剥 thinking 标记）
r.thinking?        // thinking（如果有）
r.stopReason       // "stop" | "length" | "tool_use" | "end_turn" ...
r.usage = {
  inputTokens,       // 跨协议统一（原 protocol A: prompt_tokens / B: input_tokens）
  outputTokens,      // 跨协议统一（原 A: completion_tokens / B: output_tokens）
  totalTokens,       // 跨协议统一（A: 直接有 / B: 自己算 input+output）
  thinkingTokens?,   // 跨协议统一（三处字段位置统一提取）
  cachedTokens?,     // 跨协议统一
}
r.protocol         // 实际走的协议（debug 用，业务代码不要 if 分支）
r.model            // 实际用的模型
```

## adapter 流式版本（AsyncGenerator）

`sendMessage` 是一次性版本。流式版本 `sendMessageStream` 返回 `AsyncGenerator<UnifiedDelta>`，业务用 `for await` 逐块拿 unified delta，不用关心协议。

```ts
import { sendMessageStream, type UnifiedDelta } from "./adapter.js";

// 业务代码（任何协议都是这一行）：
for await (const delta of sendMessageStream(opts)) {
  switch (delta.type) {
    case "thinking": /* delta.text —— thinking 累加 */ break;
    case "content":  /* delta.text —— 正文累加 */ break;
    case "usage":    /* delta.usage + delta.stopReason —— 末帧元数据 */ break;
    case "done":     /* 流结束 */ break;
  }
}

// delta 类型（discriminated union，业务只看 type）：
//   { type: "thinking", text: string }
//   { type: "content",  text: string }
//   { type: "usage", usage: UnifiedUsage, stopReason: string, protocol: Protocol, model: string }
//   { type: "done" }
```

**adapter 内部流式翻译关键差异**：

| 维度 | 协议 A 流式 | 协议 B 流式 |
| ---- | ---------- | ---------- |
| 数据形态 | OpenAI 字符串帧流（每帧一个 chunk JSON） | Anthropic 事件流（多种事件类型） |
| 迭代模型 | SDK `for await (chunk of stream)` | SDK callback `on("streamEvent")` + 事件队列 + Promise 桥接成 async generator |
| thinking 来源 | `choices[0].delta.content` 字符串里嵌 `<think>...</think>` 标记 | 独立 `type:"thinking"` block（`content_block_delta.delta.thinking`） |
| 跨 chunk `` 处理 | **状态机**（`inThink` 标志位 + `cursor`，按 `<<think>` / `</think>` 切分 yield） | 不需要——SDK 直接给独立 block |
| usage 位置 | 末帧顶层 `usage`（需 `include_usage`） | `message_delta.usage`（**MiniMax 流式有时报、有时不报**） |
| 结束标志 | 末帧 + `data: [DONE]` | `message_stop` 事件 + `data: [DONE]` |

**实测数据**（数学题 + thinking budget=500）：

| 协议 | thinking delta | content delta | usage | done |
| ---- | -------------- | ------------- | ----- | ---- |
| **A** | 28 | 3 | 1 | 1 |
| **B** | 12 | 3 | 1 | 1 |

**新发现**：之前 streaming-sse demo 用数学题 budget=500 测出「MiniMax 兼容端点流式 `message_delta` 不报 thinking 拆分」；**这次 adapter demo 用同样简单 prompt（"23 × 47"）却报出 `thinkingTokens: 41`**。说明 MiniMax 兼容端点的流式 thinking 拆分上报**不是绝对"不报"**——跟 prompt 长度 / thinking 总量 / 模型内部决策都有关。**写客户端不能假设"流式一定有 thinkingTokens"，要做兜底**。

`POST /api/chat-stream` 端点返回 SSE 流（每帧 `data: ${JSON.stringify(delta)}\n\n`，结束帧 `data: [DONE]\n\n`）—— 浏览器 fetch + getReader + 按 `\n\n` 切帧 + JSON.parse 累加（其他 demo 同样的模式）。

## adapter 内部做了什么

| 步骤 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| 选 SDK | `openai` 包 + `/v1` | `@anthropic-ai/sdk` + `/anthropic` |
| system 放哪 | `messages[0] = {role:"system"}` | 顶层 `system: "..."` |
| max_tokens | 可选，不填 | **必填**；启用 thinking 时还要 ≥ `budget_tokens` |
| 流式触发 | `stream: true`（一次性 demo 不传） | SDK 用 `.stream()` 方法（一次性 demo 用 `.create()`） |
| thinking | 无参数控制（MiniMax 自己嵌字符串） | 顶层 `thinking: { type:"enabled", budget_tokens:N }` |
| content 提取 | `choices[0].message.content`（string）| 遍历 `content[]`，`type:"text"` 拼起来 |
| thinking 提取 | **正则提取 `` 标记** | 遍历 `content[]`，`type:"thinking"` 拼起来 |
| stop 字段 | `choices[0].finish_reason` | 顶层 `stop_reason` |
| usage 输入 | `prompt_tokens` | `input_tokens` |
| usage 输出 | `completion_tokens` | `output_tokens` |
| usage 总量 | `total_tokens` | 自己算 `input+output` |
| usage thinking | `completion_tokens_details.reasoning_tokens` | `output_tokens_details.thinking_tokens`（MiniMax）/ `reasoning_tokens`（Anthropic 官方） |
| usage cache | `prompt_tokens_details.cached_tokens` | `cache_read_input_tokens` |
| **流式逐块 yield** | `for await (chunk of stream)` → 状态机按 `<think>` 切分 yield thinking/content | `on("streamEvent")` → 事件队列 + Promise → 按 `content_block_delta.type` yield thinking/content |

**adapter 把所有这些差异翻译成上面的 4-5 个统一字段（一次性）+ `UnifiedDelta` 判别联合（流式）。**

## 与 streaming-sse / 协议 A vs B demo 的关系

- **streaming-sse**：单协议（仅 A）跑流式，看帧长什么样 / 真实 batching
- **协议 A vs B**：5 端点对照两个协议的字段、命名、事件流、thinking 计费
- **adapter demo（本 demo）**：把协议 A vs B 的所有差异**收敛成一个统一接口**——业务代码从此不直接调 SDK

本 demo 是「协议 A vs B」这条的**收口**：之前学的所有差异，最终都在 adapter 里消化掉。

## 跑前需要

`apps/.env` 填 `MINIMAX_API_KEY`（模块 00 已有）；同 Key 走 A / B 两个协议。
