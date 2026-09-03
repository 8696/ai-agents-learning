# **Streaming / SSE**：为什么 LLM 用 SSE 而不是一次返回整段

> 对应模块：[模块 02 · LLM API 开发 ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 1 条

- **来源**：本对话
- **状态**：已沉淀
- **Demo**：已落 [apps/02-LLM-API开发/01-Streaming-SSE-step-1/](../../../apps/02-LLM-API开发/01-Streaming-SSE-step-1/)（前后端分离 · 三接口对照：模拟 SSE / 一次性 / 真实 MiniMax-M3）

> 各节写什么、怎么判断归哪一节、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

## 是什么

### 一次返回整段（non-streaming）

最普通的 HTTP 请求-响应：客户端 `fetch('/api/chat')` → 服务端把整段答案**攒齐** → 包成一个 JSON **一次性**返回。

```ts
const res = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ msg: '你好' }) });
const { answer } = await res.json();
console.log(answer); // 整杯
```

生活例子——**奶茶必须等整杯调完才端给你**。你盯着吧台干等 30 秒，前 28 秒什么都看不到，第 30 秒整杯端上来。

### 流式（streaming）

服务端**不等攒齐**，每生成一段就**先发一块**给客户端。LLM 是 token by token 生成的——服务端每吐几个 token 就 flush 一次。HTTP 用 **chunked transfer**（HTTP/1.1）或 HTTP/2 DATA 帧承载「分块」这件事，但**chunked 本身没规定每块是什么格式**。

生活例子——**接一杯、端一口**。你喝第一口只要 1 秒。

### SSE（Server-Sent Events）

SSE 就是给 chunked 流规定**一种最简单、最通用的文本协议壳**：

- `Content-Type: text/event-stream`
- 一帧 = 一个或多个 `field: value` 行 + 空行（`\n\n`）
- 最常用字段：`data:`（内容）、`event:`（事件名，可选）、`id:`（断点续传 ID，可选）、`: comment`（注释行）
- 结束帧：约定俗成 `data: [DONE]\n\n`（OpenAI / Anthropic 都是这样）

OpenAI 流式响应的原始帧长这样：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"你"}}]}

data: {"choices":[{"index":0,"delta":{"content":"好"}}]}

data: [DONE]

```

`delta.content` 是**增量**——只多了几个字。客户端**累加**到答案里。

生活例子——**老式电报机**。电报员每写好一句话，按一下发送，对方屏幕跳出一句；每句之间一小段停顿（空行），对方知道「这句完了，下一句来了」。LLM 每多吐几个字 = 电报员多拍一下发报键。

> **关键易混（这条最重要）**：`delta.content` 是**字符串字段**，**不是 token 字段**。这个 string 是**几个 token detokenize 之后拼回来的字**——可能含 1 个、2 个或更多 token，也可能厂商把相邻几个 token 攒一起 flush 到一帧。**3 个 token 不一定对应 3 帧**。详见 [§7 易混](#7-token--frame--content-长度)。

> **第二个关键易混**：`delta.content` **不一定只装「最终回答」**——带 reasoning / thinking 的模型可能把思考过程也放在这里。**三种字段模式并存**，客户端不能假设（详见 [§8 易混](#8-thinking--answer--三种字段模式)）。

### WebSocket（对照参照物）

全双工：客户端和服务端在一条 TCP 上**互发**消息。建立连接要 HTTP Upgrade 握手（`Upgrade: websocket`）。

生活例子——**双向对讲机**。你也能抢话。

## 为什么（Agent 开发要懂）

### 现在写 Agent 会踩的具体后果

1. **不读 chunk 就 `await res.json()`** → 拿到空对象或报错。`stream: true` 下必须用 `ReadableStream` 的 `getReader()` 逐块读。
2. **忘了 `\n\n` 是帧分隔** → 自己解析 SSE 时把多帧当一帧，UI 一次性把后半段吐出来。
3. **忘了结束帧 `data: [DONE]`** → 死循环等下一帧。正确做法：收到 `[DONE]` 或 `finish_reason` 非空就退出。
4. **JSON 不完整就 parse** → 一帧的 JSON 可能被 TCP 拆成两**块**到。用 SDK（OpenAI / Anthropic）最稳；手写解析时要 buffer。
5. **断线不知道** → 长连接被中间网关掐了，客户端还在 `await reader.read()`。要加心跳（服务端定时发 `: keep-alive\n\n`）+ 客户端超时。
6. **流式 ≠ 实时**：「首 token 延迟（TTFT）」是真正影响体感的关键；总耗时差不多。
7. **WebSocket 误用**：浏览器 `WebSocket` 构造里**带不了自定义 Header** → Key 得拼 URL → Key 进请求日志 / Referer / 代理 = 泄漏。

### 为什么「等整杯」对 LLM 是大问题

LLM 生成 200 字可能要 5–15 秒，1000 字 20–40 秒。如果等攒齐再返回：

- 用户面对**空白屏幕 5+ 秒**才会看到任何字——体感像「应用卡死」。
- 一旦客户端超时，**整段作废**，前 8 秒算力全白烧。
- 无法做**打字机效果 / 增量渲染 / 边写边显示引用**。

流式把 TTFT 从「整段时长」压到「首 token 时长」，体感从「卡死」变成「在打字」。

## 易混点

### 1.「流式」≠「SSE」

- 流式 = 服务端边生成边发（HTTP chunked 也算）。
- SSE = 流式 + **规定好的 `data:` / `event:` / `id:` 文本协议**。

类比：「流式」是快递**分批送**，SSE 是「分批送 + **每个包裹贴规定面单**」。**流式可以不是 SSE**（视频流是流式但用 MPEG-TS 容器）；**SSE 一定是流式**。

### 2.「HTTP/1.1 chunked」≠「HTTP/2 stream」

- chunked：HTTP/1.1 的分块传输，**不知道总长度**就一坨数据切成块发送。
- HTTP/2 stream：HTTP/2 多路复用的**逻辑流**，chunked 在 HTTP/2 里**默认关闭**——HTTP/2 自己用 DATA 帧做流式。

OpenAI / Anthropic 在 HTTP/1.1 上用 SSE；在 HTTP/2 上改成「**SSE over HTTP/2**」或 JSON Lines。

### 3.「Server-Sent Events」≠「Server Streaming」

- SSE 是 W3C / WHATWG **规范名**（`text/event-stream`）。
- gRPC 里的 **Server Streaming** 是 protobuf 帧。名字像，**协议不一样**。

### 4. SSE 的「事件」≠ WebSocket 的「消息」

- SSE 一事件 = **一个或几个 `data:` 行 + 空行**，客户端 `EventSource.onmessage` 拿到**整段 data 拼起来**的字符串。
- WebSocket 一消息 = **一帧**（可文本/二进制），`onmessage` 拿到那段数据。
- OpenAI 流式 `data: {json}\n\n`，**JSON 才是真正的「内容」**，SSE 只是壳。

### 5. 流式 ≠ 实时

流式只是**不等攒齐**，但每个 token 还是要等模型算完。流式**显著降低 TTFT**，但**总耗时可能差不多**（甚至略慢，因为多了网络往返）。

### 6. 浏览器 `EventSource` ≠ `fetch` + `getReader`

- `EventSource`：浏览器原生，**只能 GET**；Header 受限。
- `fetch` + `getReader`：现代浏览器 / Node 18+ 都支持，能 POST、能设任意 Header。

LLM 调用**几乎都用 fetch + getReader**（要 POST、要发 Authorization、要设 `stream: true`）。

### 7. token ≠ frame ≠ `content` 长度

流式响应里**没有任何字段**告诉你「这一帧 = 几个 token」。三个层级必须分开看：

- **token**：模型内部生成单位（`[我] [是] [AI]` = 3 个 token）
- **frame**：SSE 帧 / HTTP chunk，**数量由厂商 batching 决定**
- **`content`**：每帧解码后的字符串，**长度由 batching + detokenize 共同决定**

三者完全解耦。**`delta.content` 是 string，不是 token 计数**。

**真实例子 1**：用 `gpt-tokenizer`（cl100k 词表）跑「我是AI」：

```ts
import { encode } from "gpt-tokenizer";
encode("我是AI");
// → [34211, 10938, 15836]   // 3 个 token ID
//   "我"  → 34211
//   "是"  → 10938
//   "AI"  → 15836
```

3 个 token。**但 SSE 帧数看厂商 batching**——可能 1 帧 `content: "我是AI"`、3 帧各一个、2 帧 `["我是", "AI"]`，**都对**。

**真实例子 2**：OpenAI 跑 "Hello world"，词表切出 2 个 token `["Hello", " world"]`（前导空格单独一个 token）。SSE 可能来：

| 厂商策略 | 帧 #1 | 帧 #2 | 帧 #3 |
| ------- | ----- | ----- | ----- |
| 逐 token flush | `"Hello"` | `" world"` | `[DONE]` |
| 攒 2 个 flush | `"Hello world"` | `[DONE]` |
| 按时间 flush | `"Hello"` | `" world"` | `[DONE]` |

**你无法控制、也不应该假设**是哪一种。

**流式过程中拿不到 token 数**——只有**最后帧的 `usage.completion_tokens`** 报整段总数（OpenAI 默认流式也带 `usage`，除非显式 `stream_options.include_usage: false`）。**生产里计费唯一看 `usage`，不按帧数、不按 `content.length`**。

### 8. thinking ≠ answer · 三种字段模式

带 reasoning / thinking 能力的模型（OpenAI o 系列、DeepSeek R1、Anthropic Claude extended thinking、MiniMax-M3、Qwen QwQ 等）**不**把思考过程当最终回答直接吐出，但**字段位置三种模式并存**，客户端不能假设。

| 模式 | 厂商 / 模型 | 字段位置 | 怎么识别 |
| --- | ---------- | ------- | ------- |
| **同字段 + 标记** | **MiniMax-M3**（本 demo 实证）、Qwen 早期、部分国产 | `choices[0].delta.content` 字符串里嵌 `<think>...` 标记 | 同一字段里有 `<think>` 字面文本 |
| **独立字段** | DeepSeek R1 / V3、Qwen 较新版、OpenAI o 系列早期试用 | `choices[0].delta.reasoning_content`（**与 `delta.content` 同层、独立字段**） | `chunk` JSON 顶层有 `reasoning_content` 字段 |
| **独立 block** | Anthropic Claude extended thinking | `content_block_delta.delta.type: "thinking"`（**不是** `"text"`） | Anthropic 流里 type 不是 text |

**写客户端必须处理**：

1. **同字段 + 标记**：解析 `<think>...` 字面，**抽出来藏起来**；只渲染标记外的 `delta.content`。
2. **独立字段**：直接拿 `reasoning_content`，**不要和 `delta.content` 混着显示**——给开发者 / 调试面板，**不**给终端用户。
3. **独立 block**：Anthropic 的 `type: "thinking"` block 单独走另一路 UI。

**直接累加 `delta.content` 到 DOM = 把思考过程渲染给最终用户**——是这条最常见的翻车。

### 计费维度：reasoning_tokens 单独计

带 reasoning 的模型，`completion_tokens` **包含** thinking + 回答两部分，且 thinking 通常**单独计费**（按 reasoning 价格，**比回答贵 / 单独计价 / 部分模型不计费**，看厂商条款）。`usage` 里 `completion_tokens_details.reasoning_tokens` 是 thinking 部分。

**生产里计费要看完整 `usage` 详情，不能只看 `completion_tokens`**——也不要把 `completion_tokens` 当作「可见回答的 token 数」。

**真实跑出**（本 demo MiniMax-M3 实证）：

```
usage.completion_tokens: 117
usage.completion_tokens_details.reasoning_tokens: 102
└─ 真实可见回答的 token 数 ≈ 117 − 102 = 15
```

## 例子

### 例子 1：一次返回 vs 流式 的体感差异

同样生成 11 个 token，每个间隔 200ms（**总耗时 2.2s**）：

| 模式 | TTFT（看到第一个字） | 总耗时 |
| ---- | ------------------- | ------ |
| 一次性（攒齐再返） | 2.2s | 2.2s |
| SSE 流式 | 0.2s | 2.2s |

**总耗时一样**，但流式把「看到第一个字」从 2.2s 压到 0.2s——这就是 LLM 用流式的核心动机。

生活例子：你点了一杯奶茶，**奶茶店选择 30 秒调好整杯端给你** vs **每做好一口就推一口给你**。总时间一样，但你**第一口茶下肚的快感**差 30 倍。

### 例子 2：OpenAI 一帧的完整样子

一帧（一次事件）：

```
data: {"id":"chatcmpl-9X","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"你"},"finish_reason":null}]}

```

拆开看：

- `data:`：字段名（SSE 规范）。
- `{...}`：JSON 内容（OpenAI 协议，**装在 SSE 里**）。
- `\n`：第一行的结束。
- `\n`（紧跟着的额外换行）：**帧分隔符**。SSE 规定空行 = 帧结束。

下一帧的 `delta.content` 是「好」，客户端**累加**后答案变成「你好」。

最后一帧是 `data: [DONE]\n\n`——客户端看到 `[DONE]` 就退出循环。

### 例子 3：Node 里手写 SSE server + 流式消费

见 [apps/02-LLM-API开发/01-Streaming-SSE-step-1/](../../../apps/02-LLM-API开发/01-Streaming-SSE-step-1/)。**前后端分离** + 三个对照接口：

| 接口 | 数据源 | 调 API | 每帧 content |
| --- | ------ | ------ | ------------ |
| `/api/stream` | 本地模拟 | ❌ | **1 字符**（教学简化） |
| `/api/blocking` | 本地模拟 | ❌ | 一次返回 |
| `/api/real` | **线上 MiniMax / 智谱 / OpenAI** | ✅ | **1～多 token 解码后的字符串**（真实 batching，**原样转发 SDK chunk JSON，不做任何字段提取**） |

后端起 HTTP server（`/api/stream` SSE + `/api/blocking` 一次性 + `/api/real` 调真实模型 + `/` 静态页）；前端 `fetch + getReader` 流式读，按 `\n\n` 切帧，累加 `delta.content` 拼出最终答案。`/api/real` 需要 `apps/.env` 里有 `MINIMAX_API_KEY`（或兼容 OpenAI 协议的其他 Key）。

跑法：

```bash
cd apps
yarn app:02-01-streaming-sse-step-1
```

打开浏览器 `http://127.0.0.1:5173/`，点页面里三个按钮对照；后端控制台同步打印每一帧 SSE 原文（**真实版会打 OpenAI 原始 chunk 全文**，含 `id` / `object` / `model` / `service_tier` / `base_resp` 等）。

### 例子 4：真实 MiniMax-M3 调用实证（token ≠ frame 的数字证据）

prompt：`用一句话介绍你自己，30 字以内。`（MiniMax-M3 模型，2026-09 跑出）

| 指标 | 数值 |
| ---- | ---- |
| 总帧数 | **47** |
| `completion_tokens` | **117**（**含 thinking + 回答**；thinking 详见末行） |
| 平均 token / 帧 | **≈ 2.5** |
| 第一帧 content | `""`（空 role 帧，常见） |
| 末帧 content | `"解惑。"`（最后可见字） |
| `finish_reason` 出现帧 | #46（`"stop"`，**还在 content 帧里**） |
| `usage` 出现帧 | #47（**无 content，纯 usage 帧**） |
| `usage.completion_tokens_details.reasoning_tokens` | **102**（MiniMax M3 的 thinking 链；**可见回答 token 数 ≈ 117 − 102 = 15**） |
| 第一帧含 `<think>` 标记 | 帧 #2 content 开头 = `"<think>The"`（**MiniMax-M3 是「同字段 + 标记」模式**） |

**真实观察到的帧 content 长度分布**（节选）：

| 帧 # | content | 字符数 |
| --- | ------- | ------ |
| #22 | `"我是MiniMax-M"` | 8 |
| #38 | `" concise and"` | 12 |
| #44 | `"答"` | 1（边界） |
| #45 | `"解惑。"` | 3 |
| #46 | `""`（**只剩 `finish_reason` + `role`，content 已空**） | 0 |
| #47 | `""`（只剩 `usage`，**无 choices**） | 0 |

**直接证据**：
1. **117 token 拆成 47 帧**，平均 2.5 token/帧——**token 与 frame 完全解耦**。
2. **`usage` 只在最后一帧**出现且**只报一次**——**流式过程中拿不到当前 token 数**。
3. **`finish_reason` ≠ 结束帧**：`finish_reason: "stop"` 出现在 #46，但**实际关连接**是 #47（usage 帧之后）。
4. **OpenAI 兼容接口的扩展字段**：`service_tier: "standard"` / `base_resp: {status_code: 0, status_msg: ""}` / `completion_tokens_details.reasoning_tokens`——OpenAI 官方没有这些，是 MiniMax（及部分国产模型）自己加的。**写客户端别假设字段只有 OpenAI 那套**。

## 我追问过的

- **问了：一定是 SSE 协议吗？** → 答：不是。多数主流（OpenAI、Anthropic、Mistral、DeepSeek、智谱、Gemini）用了 SSE，但 **Ollama 用 NDJSON**（每行一段 JSON，无 `data:` 前缀、无 `[DONE]`）、HTTP/2 链路下用 raw stream / JSON Lines、gRPC 链路下用 gRPC Server Streaming、少数中转用 WebSocket。LLM 多数选 SSE 不是因为 SSE 多牛，而是**SSE 是最少折腾的 HTTP 长连接推流**：HTTP/1.1 兼容、企业网关友好、浏览器 API 简单、鉴权 Header 能带、自动重连。
- **追问链：`delta.content: "你"` 是一个 token 吗？** → 三轮才问清楚。
  - 第一轮答偏到 batching / 字符 = token，绕远了。
  - 第二轮点出字段语义：「`delta.content` 是 string 字段，不是 token 字段」；流式响应**没有「这一帧 = N token」的字段**；token 数**只能**等最后帧 `usage` 拿总数（且只报一次）。
  - 第三轮点出关键误解：**3 个 token 不一定对应 3 帧**——`content` 是解码后的字符串，可能 1 帧含 3 个 token（厂商攒批），也可能 3 token 被拆到多帧；token / frame / content 长度**三者完全解耦**。**生产里计费唯一看 `usage.completion_tokens`**，不要按帧数或 `content.length` 算。
- **追问：思考模式（thinking）是不是也放在 `delta.content` 里？** → 答：**不一定，三种模式并存**。
  1. **同字段 + 标记**：`delta.content` 字符串里嵌 `<think>...</think>` 字面（MiniMax-M3 本 demo 实证、Qwen 早期、部分国产）。
  2. **独立字段**：`choices[0].delta.reasoning_content` 与 `delta.content` 同层、独立（DeepSeek R1 / V3、Qwen 较新版）。
  3. **独立 block**：Anthropic Claude extended thinking 用 `content_block_delta.delta.type: "thinking"` 单独 block（type ≠ "text"）。
  **三种模式互不兼容**，写客户端不能假设。
  **计费维度**：`completion_tokens` **包含** thinking + 回答；thinking 通常**单独计费**（可能比回答贵）；`usage.completion_tokens_details.reasoning_tokens` 是 thinking 部分。本 demo MiniMax-M3 实证：`completion_tokens=117` 中 `reasoning_tokens=102`，**真实可见回答的 token 数 ≈ 15**。
  **最常见翻车**：直接 `textContent += delta.content` 到 UI → **思考过程被渲染给用户**。
- **追问：能把 `/api/real` 改成 nodejs 端**原样输出**给前端、不做修改吗？** → 答：可以，但有个**坑**——OpenAI SDK v4 的 `stream` 迭代返回的是 **zod 类实例（`ChatCompletionChunk`）**，不是 plain object。**直接 `JSON.stringify(chunk)` 会得 `{}`**（zod 实例的属性不通过 enumerable 暴露）。正确做法：
  ```ts
  const plain = JSON.parse(JSON.stringify(chunk)); // 把 zod 实例彻底 plain 化
  res.write(`data: ${JSON.stringify(plain)}\n\n`);
  ```
  这样前端拿到的就是 SDK 解析后的同一份完整 JSON（含 `id` / `object` / `model` / `created` / `choices` / `usage` / `service_tier` / `base_resp`），与 HTTP wire format 一致。
  **对照**：原 demo 把 chunk 包成 `{idx, content, usage}` 是「教学简化」；改成原样转发后，**学习者能从浏览器控制台直接看到真实 OpenAI chunk JSON**，对照 SDK 内部结构与 wire format。
  本 demo 实证帧 #1：`{"id":"...","choices":[{"index":0,"delta":{"role":"assistant"}}],"created":...,"model":"MiniMax-M3","object":"chat.completion.chunk","usage":null,"service_tier":"standard"}`——**第一帧只有 role、没有 content**（角色定位帧，常见）。
  **本条不写进踩坑 / 易混**：这是 SDK 库选型坑（zod / class instance），不是 SSE 协议本身的问题；写到「我追问过的」就够了。

## 取舍

- **手写 SSE 解析 vs 用 SDK**：
  - 手写：`fetch` + `getReader()` + 按 `\n\n` 切 + `JSON.parse`。**教学价值高、调试可见每帧**。
  - SDK：OpenAI / Anthropic SDK 帮你处理完一切。**生产用 SDK**，但**至少要手写过一次**，否则排查问题时不知道数据长什么样。
- **流式 vs 一次性**：LLM 场景**默认流式**。少数场景（如短回答、批量离线、生成 embedding）用一次性——TTFT 不重要、整体吞吐更重要。

## 踩坑

1. `await res.json()` 配 `stream: true` → 报错或空对象。**必须流式 reader**。
2. TCP 拆包：一帧 JSON 可能**跨多个 chunk 到达**。要么 buffer 累加（手写），要么 SDK 兜。
3. 忘记 `[DONE]` → 死循环。SDK 会处理，手写要加。
4. 长连接被掐 → 客户端傻等。加心跳（`: keep-alive\n\n`） + 客户端超时。
5. WebSocket 带 Key 进 URL → 泄漏到日志 / Referer / 代理。**SSE 走 Header**，不要退而求其次用 WebSocket + URL。
6. `stream: true` 忘了设 → 服务端按一次性返，客户端流式读也读不到东西。
7. 流式响应**中途出错**（网络断 / 模型报错）：服务端可能**不返回 `[DONE]`**就关连接。客户端要处理 `reader.read()` 的 `done: true` 时的「残余 buffer」——可能有错误 JSON 没切完。
8. **按帧数 / `content.length` 反推 token 数** — 不可行。`delta.content` 是解码后字符串，与模型 token 不一一对应（详见 [§7 易混](#7-token--frame--content-长度)）。token 数**唯一**信源是 `usage`（整段结束才报）。想实时控制成本 = 等结束拿 `usage.completion_tokens` 计费。
9. **直接把 `delta.content` 累加到 DOM 渲染给最终用户** — 带 reasoning 的模型会把 `<think>...` 嵌在 content 里（MiniMax-M3 / Qwen 早期模式）或在独立字段里（DeepSeek），**必须分开渲染**：thinking 给开发者 / 调试面板，**只把 `<think>...` 之外的回答**给用户（详见 [§8 易混](#8-thinking--answer--三种字段模式)）。直接 `textContent += chunk.content` = 用户看见「思考过程 + 答案」混在一起。

## 过关自检

合上文件，能讲清：

1. **一帧长什么样**：`Content-Type: text/event-stream`；一个或多个 `field: value` 行 + 空行（`\n\n` 收帧）；OpenAI 每帧 `data: {json}\n\n`，`json.choices[0].delta.content` 是增量；结束帧 `data: [DONE]\n\n`。
2. **为什么选 SSE 而不是 WebSocket**：① HTTP/1.1 兼容 + 企业网关/代理友好；② 浏览器 `EventSource` 直接带 `Authorization` Header，WebSocket **带不了**（Key 进 URL = 泄漏）；③ 自动重连 + Last-Event-ID 断点续传；④ 服务端实现 3 行；⑤ 单向推内容，WebSocket 的「双向」是多余能力。
3. **流式 vs 一次性**：流式显著降低 TTFT（首 token 延迟），但总耗时可能差不多；LLM 默认流式。
4. **易混**：流式 ≠ SSE；HTTP/1.1 chunked ≠ HTTP/2 stream；SSE ≠ gRPC Server Streaming；`EventSource` ≠ `fetch` + `getReader`。
5. **写代码会踩**：必须 `getReader()` 流式读；按 `\n\n` 切帧；遇 `[DONE]` 退出；buffer 累加处理 TCP 拆包；加心跳 + 超时。

## 还没搞懂的

- HTTP/2 下的 SSE 帧格式与 HTTP/1.1 完全相同，还是有差异？留到模块 19 性能 / 网络时再查。
- 服务端发完最后一帧后**主动 close** vs **keep-alive 等客户端断开**，对浏览器 `EventSource` 的「自动重连」行为有什么影响？实测前先按「主动 close 就不重连，留 keep-alive 由客户端断开」记。