# **协议 A vs B**：`chat.completions` 与 `messages.create` 的字段、role、usage 位置

> 对应模块：[模块 02 · LLM API 开发 ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 2 条

- **来源**：本对话（§6.2 完整讲解 + 3 个追问 + think-test.ts 4 组实验 + /api/b-thinking-stream 端点 223 事件实测 + README）
- **状态**：已沉淀
- **Demo**：已落 [apps/02-LLM-API开发/02-协议-A-vs-B/](../../../apps/02-LLM-API开发/02-协议-A-vs-B/)（5 个端点：/api/a /api/b /api/compare /api/think-compare /api/b-thinking-stream；用 MiniMax-M3 同 Key 跑双协议对照）

> 各节写什么、怎么判断归哪一节、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

---

## 是什么

**协议 A = OpenAI Chat Completions API**。npm 的 `openai` 包；入口 `client.chat.completions.create({...})`。`messages` 数组里塞 system / user / assistant 三种 role。流式触发 `stream: true`；流式 usage 要在最后一帧才出现（需 `stream_options: { include_usage: true }`）。

**协议 B = Anthropic Messages API**。npm 的 `@anthropic-ai/sdk`；入口 `client.messages.create({...})` 或 `client.messages.stream({...})`（推荐后者，事件流模型）。`messages` 数组里**只放 user / assistant**；`system` 单独提到顶层参数。流式触发用 SDK 的 `messages.stream()`。`max_tokens` **必填**。

**两者都是「同一个模型可被两种协议调用」**：MiniMax-M3 这个模型，在 MiniMax 国内站既有 OpenAI 兼容端点 `/v1`，又有 Anthropic 兼容端点 `/anthropic`；**同一把 `MINIMAX_API_KEY`、换 `baseURL` 就行**。底层模型是同一套，只是 API 协议壳不同。

**生活例子**——同一道菜可以两种点法：

- 协议 A：「一份鱼香肉丝，**备注**：少辣」（system 写进 messages）
- 协议 B：「**少辣**——一份鱼香肉丝」（system 写顶层）

菜一样、口味一样、价格一样；但**服务员手里的点菜单格式不一样**。厨房（模型）做出的是同一道菜；点单方式（协议）是不同约定。

---

## 字段对照速查表（写适配层贴墙上）

| 维度 | 协议 A（OpenAI 兼容） | 协议 B（Anthropic Messages） |
| ---- | --------------------- | --------------------------- |
| SDK | `openai`（v4） | `@anthropic-ai/sdk` |
| 入口 | `client.chat.completions.create({...})` | `client.messages.stream({...})` 或 `client.messages.create({...})` |
| `messages` 里允许的 role | `system` / `user` / `assistant` / `tool` | `user` / `assistant`（**无 system**） |
| `system` 位置 | `messages` 内 `{role:"system", content}` | 顶层参数 `system: "..."` |
| `max_tokens` | 可选 | **必填**（Messages API 强制） |
| 流式触发 | `stream: true` | SDK 用 `client.messages.stream()`（事件流），不是单纯 `stream: true` 布尔 |
| 流式文本字段 | `choices[0].delta.content`（**string 字段**） | `content_block_delta.delta.text`（在事件里） |
| 流式 usage 位置 | OpenAI 兼容：最后一帧才有（需 `stream_options.include_usage: true`） | Anthropic SDK：`stream.finalMessage()` 拿完整 Message 含 usage |
| usage 输入字段 | `usage.prompt_tokens` | `usage.input_tokens` |
| usage 输出字段 | `usage.completion_tokens` | `usage.output_tokens` |
| 结束标志（流式） | `data: [DONE]\n\n` 帧 | `message_stop` 事件 |
| 结束字段（非流式） | `choices[0].finish_reason` | `stop_reason` |

**字段名差异映射**（写适配层最容易写错的 5 处）：

```text
A: choices[0].delta.content        ↔  B: content_block_delta.delta.text
A: choices[0].finish_reason        ↔  B: stop_reason
A: messages[].role="system"        ↔  B: 顶层 system 参数
A: usage.prompt_tokens             ↔  B: usage.input_tokens
A: usage.completion_tokens         ↔  B: usage.output_tokens
A: messages[].role="tool"          ↔  B: tool_use block（结构差异大，模块 05 详说）
```

---

## 完整字段映射（写适配层详细版）

上面那张 11 行速查表只能查"一对一映射"。下面这份详细表把所有字段拆开对照——遇到边缘情况（多模态、工具调用、thinking 计费、流式事件命名等）查这里。

### 1. 顶层请求参数对照

| 字段 | 协议 A（OpenAI 兼容） | 协议 B（Anthropic Messages） |
| ---- | --------------------- | --------------------------- |
| **SDK** | `openai` (v4) | `@anthropic-ai/sdk` |
| **入口方法** | `client.chat.completions.create({...})` | `client.messages.create({...})` 或 `client.messages.stream({...})` |
| **`model`** | 必填 | 必填 |
| **`messages`** | 必填，数组（**可含 system**） | 必填，数组（**只能 user/assistant**） |
| **`system`** | ❌ 顶层不放 → 放 messages[0] `{role:"system", content}` | ✅ 顶层参数 `system: "..."` 或 block 数组 |
| **`max_tokens`** | 可选 | **必填**（不填 400） |
| **`temperature`** | 可选，默认 1 | 可选，默认 1 |
| **`top_p`** | 可选，默认 1 | 可选，默认 1 |
| **`stream`** | 可选 boolean | **不传**（用 `messages.stream()` 走流式） |
| **`stop`** | `stop: "..."` 或 `stop: ["..."]`（**stop**） | `stop_sequences: ["..."]`（**stop_sequences，注意单复数**） |
| **`user`** | `user: "user-123"` | `metadata: { user_id: "user-123" }`（**位置 + 命名都不同**） |
| **`tools`** | 顶层 `tools: [...]`（模块 05 详说） | 顶层 `tools: [...]`（**结构差异大**，模块 05 详说） |
| **`thinking`** | ❌ 不支持 | ✅ 顶层 `thinking: { type: "enabled", budget_tokens: N }` |
| **`stream_options`** | `{ include_usage: true }`（让 usage 在末帧） | ❌ 不需要（SDK 自动 finalMessage 拿 usage） |

### 2. messages 数组对照

| 维度 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| 允许的 `role` | `system` / `user` / `assistant` / `tool` | `user` / `assistant`（**无 system / tool**） |
| 基础结构 | `{role, content}` | `{role, content}` |
| `content` 类型 | string 或数组 `[{type:"text"\|"image_url"}, ...]` | string 或数组 `[{type:"text"\|"image"\|"tool_use"\|"tool_result"}, ...]` |
| 多模态 image | `{type:"image_url", image_url:{url:"..."}}` | `{type:"image", source:{type:"base64"\|"url", ...}}`（**结构差异大**） |
| tool_calls（assistant 调工具） | 消息里多 `tool_calls: [{id, type:"function", function:{name, arguments}}]` | 消息里 `content` 是 block 数组，其中一个 block `{type:"tool_use", id, name, input}` |
| tool 消息（返回结果） | `{role:"tool", tool_call_id, content}` | `{role:"user", content:[{type:"tool_result", tool_use_id, content:"..."}]}` |

### 3. 流式请求触发对照

| 维度 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| **触发方式** | `stream: true`（顶层 boolean） | **不传 stream**；改用 `client.messages.stream({...})` 方法 |
| **请求体里要不要 stream 字段** | 要 | **不要**（SDK 入口决定） |
| **流式 usage 上报控制** | `stream_options: { include_usage: true }` | 自动（`finalMessage()` 拿完整 Message） |

### 4. 非流式响应字段对照（MiniMax-M3 实测数据）

**同 prompt + 同 Key 实测**（`"用一句话介绍你自己，10字以内"` + system `"你是简洁的助手。"`）：

| 维度 | 协议 A 响应字段 | 协议 B 响应字段 |
| ---- | --------------- | --------------- |
| **SDK 返回类型** | `ChatCompletion` 对象 | `Message` 对象 |
| **id** | `id: "06e5a4a0b865ace1..."` | `id: "06e5a49f325c3707..."`（**位置：顶层**） |
| **type** | ❌ 无 | ✅ `type: "message"`（**顶层**） |
| **model** | `model: "MiniMax-M3"` | `model: "MiniMax-M3"` |
| **role** | `choices[0].message.role: "assistant"`（**嵌在 choices 里**） | `role: "assistant"`（**顶层**） |
| **content 形态** | `choices[0].message.content` = **string** | `content: [{type:"text", text:"..."}]` = **block 数组** |
| **示例 content** | `"我是MiniMax-M3 AI助手。"` | `[{type:"text", text:"我是你的AI助手。"}]`（**同 prompt 同一模型不同回答**——LLM 抽样随机性） |
| **stop 字段** | `choices[0].finish_reason: "stop"`（**嵌在 choices 里**） | `stop_reason: "end_turn"`（**顶层**） |
| **usage 输入** | `usage.prompt_tokens: 184` | `usage.input_tokens: 57` |
| **usage 输出** | `usage.completion_tokens: 30` | `usage.output_tokens: 5` |
| **usage 总量** | `usage.total_tokens: 214` | ⚠️ **无 total_tokens**（要自己 `input + output` 算） |
| **usage cache** | `usage.prompt_tokens_details.cached_tokens: 128` | `usage.cache_read_input_tokens: 114`（**位置不同**） |
| **usage reasoning / thinking** | `usage.completion_tokens_details.reasoning_tokens: 19` | 一次性：`usage.output_tokens_details.thinking_tokens`（MiniMax 兼容端点实测位置）；Anthropic 官方：`usage.reasoning_tokens`（顶层） |
| **MiniMax 扩展字段** | `service_tier` / `base_resp` | 同左（兼容端点也加） |

**同一段响应 JSON 完整对照（实测节选）**：

```jsonc
// ── 协议 A 响应 ──
{
  "id": "06e5a4a0b865ace1a6bb7bb78a8bcf7b",
  "choices": [{
    "index": 0,
    "finish_reason": "stop",
    "message": {
      "role": "assistant",
      "content": "我是MiniMax-M3 AI助手。"
    }
  }],
  "model": "MiniMax-M3",
  "object": "chat.completion",
  "usage": {
    "prompt_tokens": 184,
    "completion_tokens": 30,
    "total_tokens": 214,
    "completion_tokens_details": { "reasoning_tokens": 19 },
    "prompt_tokens_details": { "cached_tokens": 128 }
  },
  "service_tier": "standard",
  "base_resp": { "status_code": 0, "status_msg": "" }
}

// ── 协议 B 响应 ──
{
  "id": "06e5a49f325c3707b02f4caec9beacc1",
  "type": "message",
  "role": "assistant",
  "model": "MiniMax-M3",
  "content": [{ "type": "text", "text": "我是你的AI助手。" }],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 57,
    "output_tokens": 5,
    "cache_read_input_tokens": 114,
    "service_tier": "standard"
  },
  "base_resp": { "status_code": 0, "status_msg": "" }
}
```

### 5. 流式响应字段对照（实测数据）

#### 5.1 帧 / 事件结构

| 维度 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| **基本单元** | 1 帧 = 1 个 OpenAI chunk JSON | 1 事件 = 1 个 Anthropic event JSON |
| **帧分隔** | `data: {json}\n\n` | `data: {event-json}\n\n`（**同样 SSE**） |
| **结束标志** | `data: [DONE]\n\n` | `data: [DONE]\n\n`（**同样约定**） |
| **类型数量** | **单一** chunk 结构 | **多种** 事件类型 |

#### 5.2 流式事件类型（MiniMax-M3 协议 B 启用 thinking 实测 223 个事件）

| 事件类型 | 出现位置 | 关键字段 |
| -------- | -------- | -------- |
| `message_start` | 流开始 | `message.{id, model, role, content:[], usage:{input_tokens, output_tokens:0}}` |
| `content_block_start` | 块开始 | `index, content_block: {type, [text/thinking]:"", ...}` |
| `content_block_delta` | 块内增量 | `index, delta: {type:"thinking_delta"\|"text_delta"\|..., [thinking/text]: "..."}` |
| `content_block_stop` | 块结束 | `index` |
| `message_delta` | 末帧 metadata | `delta: {stop_reason}, usage: {output_tokens, ...}` |
| `message_stop` | 流结束 | `{}` |
| `signature_delta` | thinking 块结尾 | `signature: "..."`（Anthropic 持久化用） |
| `ping` | 保活（可选） | `{}` |

**重要事件命名细节**（客户端解析别混）：

- `content_block_start.content_block.type` = `"thinking"` / `"text"`（**没后缀**）
- `content_block_delta.delta.type` = `"thinking_delta"` / `"text_delta"`（**有 `_delta` 后缀**）
- 判断最好用 `delta.thinking != null` / `delta.text != null`（看字段内容，更稳）

#### 5.3 单帧字段对照（实测帧样本）

| 维度 | 协议 A 一帧（chunk） | 协议 B 一事件（content_block_delta） |
| ---- | -------------------- | -------------------------------------- |
| **完整 JSON 形态** | `{id, object:"chat.completion.chunk", created, model, choices:[{index, delta, finish_reason?}], usage?}` | `{type:"content_block_delta", index, delta:{type:"text_delta", text:"..."}}` |
| **id 一致性** | 所有帧 id 相同（同一次请求） | `message_start.message.id` 定一次，后续事件没 id |
| **model 字段** | 每帧都有 `model` | 只在 `message_start` 出现一次 |
| **created 时间戳** | 每帧都有 | ❌ 没有 |
| **object 字段** | 每帧 `object:"chat.completion.chunk"` | ❌ 没有 |
| **文本位置** | `choices[0].delta.content` | `delta.text`（嵌在 `delta` 里） |
| **delta 字段命名** | `delta.content`（**没后缀**） | `delta.text` + `delta.type="text_delta"`（**有 `_delta` 后缀**） |
| **finish / stop 字段** | `choices[0].finish_reason`（某帧出现一次） | `message_delta.delta.stop_reason` |
| **usage 出现位置** | 末帧顶层 `usage`（需 `include_usage`） | `message_delta.usage`（**MiniMax 流式不报 thinking 拆分**） |

### 6. thinking / extended thinking 对照

| 维度 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| **默认是否有 thinking** | ✅ **有**（MiniMax-M3 实证：content 字符串嵌 `` 标记） | ❌ 无（不传 thinking 参数则没有独立 block，思考被合并进 answer） |
| **启用方式** | ❌ 无参数控制（总是有） | 顶层 `thinking: { type: "enabled", budget_tokens: N }` |
| **thinking 字段位置（非流式）** | `choices[0].message.content` 字符串里嵌 | `content: [{type:"thinking", thinking:"..."}]` block |
| **thinking 字段位置（流式）** | `choices[0].delta.content` 字符串里嵌 | `content_block_delta.delta.thinking` 字段 |
| **计费字段（一次性）** | `usage.completion_tokens_details.reasoning_tokens` | MiniMax 兼容：`usage.output_tokens_details.thinking_tokens`；Anthropic 官方：`usage.reasoning_tokens`（顶层） |
| **计费字段（流式）** | `usage.completion_tokens_details.reasoning_tokens`（末帧） | **MiniMax 兼容端点：不报**；Anthropic 官方：报 |
| **`budget_tokens`** | ❌ 不支持 | ✅ 必填（启用时） |
| **max_tokens 约束** | 顶层 max_tokens | `budget_tokens ≤ max_tokens`（否则 400） |
| **软上限 vs 硬截断** | n/a | **soft cap**（实测 budget=100 可用 153 token） |
| **signature 验证** | ❌ 无 | ✅ `signature_delta` 事件（持久化 thinking 时必须保留） |

### 7. system 字段对照

| 维度 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| **位置** | `messages[0] = {role:"system", content:"..."}` | **顶层参数** `system: "..."` 或 block 数组 |
| **多 block** | ❌ 不支持（一条 messages item） | ✅ 支持：`system: [{type:"text", text:"..."}, ...]` |
| **block 加 cache_control** | 不支持（cache 字段在 messages） | ✅ 支持：`{type:"text", text:"...", cache_control:{type:"ephemeral"}}`（模块 11 详说 prompt caching） |
| **是否算入 token** | ✅（在 prompt_tokens 里） | ✅（在 input_tokens 里） |

### 8. SDK 流式调用对照

```ts
// ── 协议 A 流式 ──
const aStream = await client.chat.completions.create({ stream: true, ... });
for await (const chunk of aStream) {
  chunk.choices[0]?.delta?.content    // 文本增量
  chunk.choices[0]?.finish_reason     // 末帧 finish
  chunk.usage                          // 末帧 usage（需 include_usage）
}

// ── 协议 B 流式 ──
const bStream = client.messages.stream({ ... });
bStream.on("text", t => ...);              // 文本增量（高层 API）
bStream.on("streamEvent", evt => ...);     // 原始事件（看完整事件流）
const final = await bStream.finalMessage();  // 完整 Message（含 usage + 所有 block）
// final.usage.input_tokens / output_tokens / output_tokens_details.thinking_tokens
```

**反模式**：

| 反模式 | 后果 |
| ------ | ---- |
| `for await (chunk of bStream) chunk.delta.content` | 拿不到文本（B 是事件流不是字符串流） |
| `bStream.on("text", ...)` 拿完整事件 | 拿不到 `signature_delta` 等非文本事件 |
| `bStream.on("event", ...)`（不是 `streamEvent`） | **不会触发**（Anthropic SDK 用 `streamEvent`） |
| `messages.create` 后拿 `chunk` 字段 | 非流式响应没有 `chunk`，那是流式专有 |
| `chat.completions.create` 不传 `stream:true` | 拿不到 SSE 流 |

### 9. 错误码对照

| 错误类型 | 协议 A | 协议 B |
| -------- | ------ | ------ |
| 鉴权失败 | `401` `invalid_api_key` | `401` `authentication_error` |
| 限流 | `429` `rate_limit_exceeded` | `429` `rate_limit_error` |
| 请求格式错 | `400` `invalid_request_error` | `400` `invalid_request_error` |
| 服务器错 | `500` / `502` / `503` | `500` / `502` / `503` / `529`（Anthropic 多 529 overloaded） |
| 上下文超长 | `400` `context_length_exceeded` | `400`（错误消息里含 "prompt is too long"） |
| 超时 | `408` / 自定义 timeout | `408` / 自定义 timeout |
| 取消 | SDK `AbortController.abort()` 抛 `AbortError` | 同 |

### 10. 一张最简对照表（写适配层贴墙上）

```text
请求侧
  A.messages[].role="system"           →  B.system (顶层)
  A.max_tokens (可选)                   →  B.max_tokens (必填)
  A.stop                                →  B.stop_sequences
  A.user                                →  B.metadata.user_id
  A.stream:true                         →  B.messages.stream() 方法
  A.stream_options.include_usage       →  B 自动（finalMessage）
  ❌                                    →  B.thinking.{type, budget_tokens}

响应侧（非流式）
  A.choices[0].message.content (string) →  B.content (block[])
  A.choices[0].finish_reason            →  B.stop_reason
  A.usage.prompt_tokens                 →  B.usage.input_tokens
  A.usage.completion_tokens             →  B.usage.output_tokens
  A.usage.total_tokens                   →  B.无，自己算 input+output
  A.usage.completion_tokens_details.reasoning_tokens
       → B.usage.output_tokens_details.thinking_tokens (MiniMax 兼容)
       → B.usage.reasoning_tokens          (Anthropic 官方)

响应侧（流式）
  A.choices[0].delta.content            →  B.content_block_delta.delta.text
  A.choices[0].finish_reason            →  B.message_delta.delta.stop_reason
  A.usage (末帧)                        →  B.message_delta.usage
                                           (注意 MiniMax 流式不报 thinking 拆分)
  A: data: [DONE]\n\n                  →  B: message_stop 事件 + data: [DONE]\n\n
```

---

## 为什么（Agent 开发要懂）

**现在写 Agent 会踩的 8 个具体后果**：

1. **写业务时 if (protocol === 'A') 满地分支**——每个 LLM 调用点都要双份代码。正确做法：写一个 adapter 层，业务用统一接口 `sendMessage(messages)`，底层按配置路由。
2. **迁移时 Key 改了**——很多人误以为换协议要换 Key。MiniMax / 智谱**同 Key**，只换 baseURL。
3. **忘了 system 在 A 里、B 在外**——把 system 塞进 B 的 messages 里，要么被忽略，要么报错。写适配层时这一处必须明确写。
4. **B 漏了 max_tokens**——Anthropic 直接 400 报错；学习阶段默认值要设个足够大的数（比如 1024），生产再按需调。
5. **流式取文本错位**——B 不是「`delta.content` 是字符串」流，是事件流；用 A 的写法 `for await (chunk of bStream) chunk.delta.content` 拿到的是 SDK 内部结构而不是 plain text。正确写法：`bStream.on("text", t => stdout.write(t))`。
6. **usage 计费字段名混用**——A 的 prompt_tokens ↔ B 的 input_tokens，名字差一字；如果做成本统计面板，写错一个就漏算一部分。
7. **流式结束判断不一致**——A 看 `[DONE]`；B 看 `message_stop` 事件。用错标志位会让客户端以为还没完，或漏读最后一帧的 usage。
8. **多协议接入时未做协议探测**——配置里「当前用的是哪家的哪个协议」应该集中放一处（env 或 config），不要散在代码里。

---

## 易混点（10 条 + 1 条 MiniMax 兼容端点 quirk）

### 1. 协议 ≠ 模型
同一模型（MiniMax-M3）可走 A 也可走 B；不同模型也可以走同一协议（OpenAI 协议接 GPT-4o-mini / MiniMax-M3 / 智谱 GLM）。**协议是「调用约定」，模型是「被调用的大脑」**。一个大脑可以被多种约定调用。

### 2. 协议 ≠ SDK
`openai` 包只能调协议 A；`@anthropic-ai/sdk` 只能调协议 B。即使底层是 MiniMax / 智谱——它们「兼容 Anthropic」是用 **Anthropic SDK + 换 baseURL**，不是用 openai 包强行调。

### 3.「OpenAI 兼容」≠「OpenAI 官方」
MiniMax / 智谱都是「兼容」——同字段、不同 baseURL，不是 OpenAI 真在跑。差别：扩展字段（MiniMax 的 `service_tier` / `base_resp`，智谱的 `extra`）各家自己加，OpenAI 官方接口**没有**这些字段。写客户端别假设字段只有 OpenAI 那套。

### 4.「Anthropic 兼容」≠「Anthropic 官方」
同上——MiniMax / 智谱的 `/anthropic` 端点是「用 Anthropic SDK 能调」，但底层不是真 Claude。海外 Anthropic 官方 baseURL 是 `https://api.anthropic.com`，只支持协议 B。

### 5. 流式 A 的「粒度」≠ 流式 B 的「粒度」
A 的流式帧是「一段 delta 文本」；B 的流式是「事件序列」（开始 / 块开始 / 块增量 / 块结束 / message_delta / message_stop）。同一个 token，B 至少要发 2 个事件（`content_block_start` + `content_block_delta`）；A 可能一帧攒好几个 token 再发。**粒度不同，监听模型不同**。

### 6. 协议 B 的 system 不能放 messages
协议 B 的 `messages` 数组里**不允许** `role: "system"`。这是 B 的硬约束。放进去会报错。

### 7. max_tokens 在 B 必填
协议 A 是可选（不填 = 模型自己决定上限）；协议 B 是**必填**（Anthropic 要求必须给）。学习阶段统一给 1024；生产按需调整。

### 8. 流式结束后 usage 出现的时机不同
- 协议 A：默认流式**不返回 usage**（要看 `stream_options: { include_usage: true }` 才在最后一帧报）；很多国产厂商即便开了这个参数也忽略。
- 协议 B：用 SDK 时是 `stream.finalMessage()` 拿完整 Message，里面 `usage` 一定有。

### 9. 多协议适配时不要写「字段混用」
最常见反模式：把协议 A 的代码复制过来，把 `delta.content` 改成 `content_block_delta.delta.text`，但忘了 system / max_tokens / usage 命名也得改。**整条路径的字段都要对齐改**，不是只改一两个字段。

### 10. OpenAI 协议的 `messages` 里能塞 tool_calls；B 用 tool_use block
A 是消息里多一个 `tool_calls` 字段；B 是消息里多个 `content` block，其中 `type="tool_use"`。模块 05 详说，但写适配层要知道**结构差异比字段命名差异大**。

### 11. MiniMax 兼容端点的「thinking 计费位置」与官方不同（详见「thinking 三种字段模式」章节）
不写在这里是为了不重复——见下文「MiniMax 兼容端点的翻译层 quirk」。

---

## 例子

### 例子 1：同一段对话的两种调用方式（代码对照）

```ts
// ── 协议 A · OpenAI Chat Completions（openai 包）──
import OpenAI from "openai";
const aClient = new OpenAI({
  apiKey: env.MINIMAX_API_KEY,
  baseURL: "https://api.minimaxi.com/v1",
});
const aStream = await aClient.chat.completions.create({
  model: "MiniMax-M3",
  messages: [
    { role: "system", content: "你是简洁的助手。" },  // ← system 在 messages 里
    { role: "user", content: "用一句话介绍你自己，10 字以内。" },
  ],
  stream: true,
  stream_options: { include_usage: true },
});
for await (const chunk of aStream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) process.stdout.write(delta);
  if (chunk.usage) console.log("\nusage:", chunk.usage);
}
```

```ts
// ── 协议 B · Anthropic Messages API（@anthropic-ai/sdk）──
import Anthropic from "@anthropic-ai/sdk";
const bClient = new Anthropic({
  apiKey: env.MINIMAX_API_KEY,                            // ← 同一个 Key！
  baseURL: "https://api.minimaxi.com/anthropic",            // ← 只换 baseURL
});
const bStream = bClient.messages.stream({
  model: "MiniMax-M3",
  system: "你是简洁的助手。",                              // ← system 在顶层，不在 messages
  max_tokens: 1024,                                       // ← 必填
  messages: [
    { role: "user", content: "用一句话介绍你自己，10 字以内。" },
  ],
});
bStream.on("text", (textDelta: string) => {
  process.stdout.write(textDelta);                          // ← 订阅 text 事件，不是 for await delta.content
});
const finalMessage = await bStream.finalMessage();
console.log("\nusage:", {
  input: finalMessage.usage.input_tokens,
  output: finalMessage.usage.output_tokens,
});
```

### 例子 2：协议 B 流式的事件序列（不带 thinking）

`client.messages.stream({...})` 不传 thinking 时收到的事件顺序：

```text
1. message_start          ← 流开始；含 message.id / model
2. content_block_start    ← 文本块开始（type=text）
3. content_block_delta    ← 文本增量；payload: { delta: { type: "text_delta", text: "你" } }
4. content_block_delta    ← 文本增量；payload: { delta: { type: "text_delta", text: "好" } }
5. ...
6. content_block_stop     ← 文本块结束
7. message_delta          ← Message 元信息（含 stop_reason + usage）
8. message_stop           ← 整个流结束
```

**易混点（写客户端必看）**：事件内 `delta.type` 实际是 `text_delta`（**带 `_delta` 后缀**），但 `content_block_start.content_block.type` 是 `text`（**没有后缀**）。判断文本增量最好用 `delta.text != null`（看字段内容），而不是判断字符串。

### 例子 3：协议 B 流式的事件序列（带 thinking）

启用 extended thinking（`thinking: { type: "enabled", budget_tokens: 500 }`）时，事件序列变成**两段**：

```text
1. message_start
2. content_block_start    ← type=thinking
3. content_block_delta    ← delta.thinking="..."
4. ...（多次 thinking_delta）
N. content_block_stop
N+1. content_block_start  ← type=text
N+2. content_block_delta  ← delta.text="..."
...（多次 text_delta）
N+M. content_block_stop
N+M+1. signature_delta    ← Anthropic thinking 验证签名（持久化要用）
N+M+2. message_delta      ← usage + stop_reason
N+M+3. message_stop
```

**实测**（MiniMax-M3 + 数学题 + budget=500）：**223 个事件**——1 个 message_start + 2 个 content_block_start + **19 个 thinking_delta** + **196 个 text_delta** + 2 个 content_block_stop + 1 个 signature_delta + 1 个 message_delta + 1 个 message_stop。

### 例子 4：MiniMax-M3 双协议同 Key 实测对照（一次性响应）

**前提**：`MINIMAX_API_KEY` 一把；A 走 `https://api.minimaxi.com/v1`，B 走 `https://api.minimaxi.com/anthropic`。

**同 prompt**：`用一句话介绍你自己，10 字以内。` + system `你是简洁的助手。`

**协议 A 响应**（节选）：

```json
{
  "id": "06e5a4a0b865ace1a6bb7bb78a8bcf7b",
  "choices": [{
    "finish_reason": "stop",
    "message": {
      "role": "assistant",
      "content": "<think>用户要求用一句话、10字以内介绍自己。我是MiniMax-M3，是AI助手。</think>\n\n我是MiniMax-M3 AI助手。"
    }
  }],
  "usage": {
    "prompt_tokens": 184,
    "completion_tokens": 30,
    "completion_tokens_details": { "reasoning_tokens": 19 },
    "prompt_tokens_details": { "cached_tokens": 128 }
  },
  "service_tier": "standard",
  "base_resp": { "status_code": 0, "status_msg": "" }
}
```

**协议 B 响应**（节选）：

```json
{
  "id": "06e5a49f325c3707b02f4caec9beacc1",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "我是你的AI助手。" }
  ],
  "usage": {
    "input_tokens": 57,
    "output_tokens": 5,
    "cache_read_input_tokens": 114,
    "service_tier": "standard"
  },
  "stop_reason": "end_turn",
  "base_resp": { "status_code": 0, "status_msg": "" }
}
```

**对照观察**：

| 维度 | A | B |
| ---- | --- | --- |
| content 形态 | string | block 数组 |
| 文本 | "我是MiniMax-M3 AI助手。" | "我是你的AI助手。"（**同 prompt 同一模型不同回答**——LLM 抽样随机性正常） |
| usage 输入 | `prompt_tokens: 184`（含 `cached_tokens: 128`） | `input_tokens: 57`（含 `cache_read_input_tokens: 114`） |
| usage 输出 | `completion_tokens: 30` | `output_tokens: 5` |
| cache | `cached_tokens: 128` | `cache_read_input_tokens: 114` |
| 结束 | `finish_reason: "stop"` | `stop_reason: "end_turn"` |
| reasoning | `completion_tokens_details.reasoning_tokens: 19` | 这次没出 |
| base_resp | 有 | 有（同字段） |
| service_tier | standard | standard |

---

### 例子 5：adapter demo 落地（业务代码完全不碰 SDK）

[apps/02-LLM-API开发/03-adapter-demo](../../../apps/02-LLM-API开发/03-adapter-demo/) 把上面所有差异**收敛到一个统一接口**——业务代码从此不直接调 SDK。

**adapter 暴露的统一类型**（业务代码只看这个）：

```ts
import { sendMessage, type SendMessageOptions, type UnifiedResponse } from "./adapter.js";

// 业务调用（不管后面是 A 还是 B）：
const r: UnifiedResponse = await sendMessage({
  protocol: "A" | "B",                    // 选协议
  message: "你好",
  system: "你是简洁的助手。",             // 可选
  thinking: { type: "enabled", budget_tokens: 500 },  // 可选
});

// r 的字段（业务永远只看这些）：
r.content          // 正文（已剥 thinking 标记）
r.thinking?        // thinking（如果有）
r.stopReason       // "stop" | "length" | "end_turn" ...
r.usage = {
  inputTokens,       // 跨协议统一（原 A: prompt_tokens / B: input_tokens）
  outputTokens,      // 跨协议统一（原 A: completion_tokens / B: output_tokens）
  totalTokens,       // 跨协议统一（A 直接有 / B 自己算）
  thinkingTokens?,   // 跨协议统一（三处字段位置统一提取）
  cachedTokens?,     // 跨协议统一
}
r.protocol         // 实际走的协议（debug 用）
r.model            // 实际用的模型
```

**adapter 内部翻译的 8 件**（业务层完全感知不到）：

| # | adapter 必须处理 | A → B 的翻译 |
| - | -------------- | ----------- |
| 1 | **SDK 选择** | `openai` 包 ↔ `@anthropic-ai/sdk` |
| 2 | **system 字段位置** | `messages[0] = {role:"system"}` → 顶层 `system: "..."` |
| 3 | **`max_tokens` 必填性** | A 可选 → B 必填（默认 1024；启用 thinking 时 ≥ budget_tokens） |
| 4 | **流式 vs 一次性** | A 用 `stream: true` 布尔；B 用 `.stream()` 方法（一次性 demo 都用 `.create()`） |
| 5 | **流式结束判断** | A `data: [DONE]` → B `message_stop`（一次性 demo 不用关心） |
| 6 | **usage 字段命名** | `prompt/completion/total` ↔ `input/output`（无 total 自己算） |
| 7 | **thinking 字段位置** | A 嵌 `delta.content` 字符串 `<think>` 标记 → B 独立 `type:"thinking"` block |
| 8 | **thinking 计费字段三处不同** | A `completion_tokens_details.reasoning_tokens` ↔ MiniMax 兼容 B 一次性 `output_tokens_details.thinking_tokens` ↔ Anthropic 官方 B 顶层 `reasoning_tokens` → 全部翻译成 `usage.thinkingTokens` |

**实测响应（adapter 输出，业务看到的就是这个）**：

```jsonc
// ── 协议 A 实测（adapter 翻译后）──
{
  "content": "23 × 47 = **1081**\n\n计算过程：...",
  "thinking": "The user is asking a simple multiplication...",
  "stopReason": "stop",
  "usage": {
    "inputTokens": 183,
    "outputTokens": 156,
    "totalTokens": 339,
    "cachedTokens": 128
    // thinkingTokens 字段无值——这次模型没出 thinking
  },
  "protocol": "A",
  "model": "MiniMax-M3"
}

// ── 协议 B 实测（adapter 翻译后，启用 thinking budget=500）──
{
  "content": "23 × 47 = **1081**\n\n计算过程：...",
  "thinking": "The user is asking me to compute 23 × 47...",
  "stopReason": "end_turn",
  "usage": {
    "inputTokens": 55,
    "outputTokens": 144,
    "totalTokens": 199,
    "thinkingTokens": 99,    // ← B 端点这次有 thinking
    "cachedTokens": 128
  },
  "protocol": "B",
  "model": "MiniMax-M3"
}
```

**两个响应字段完全一致**——业务层永远不写 `if (protocol === "A")`。

---

## thinking 三种字段模式（学完本条必补的进阶）

MiniMax-M3 这种带 reasoning 的模型，**thinking 字段位置三种模式并存**，客户端不能假设：

| 模式 | 厂商 / 模型 | 字段位置 | 怎么识别 |
| --- | ---------- | ------- | ------- |
| **同字段 + 标记** | **MiniMax-M3**（A 端点实证）、Qwen 早期、部分国产 | `choices[0].delta.content` 字符串里嵌 `<think>...` 字面 | 同一字段里有 `<think>` 字面文本 |
| **独立 block** | Anthropic Claude extended thinking（MiniMax 协议 B 端点实证支持） | `content_block_delta` 事件里 `delta.thinking`（独立 block） | 流式事件序列里 `content_block_start.content_block.type="thinking"` |
| **独立字段** | DeepSeek R1 / V3、Qwen 较新版、OpenAI o 系列早期 | `choices[0].delta.reasoning_content`（与 `delta.content` 同层） | chunk JSON 顶层有 `reasoning_content` 字段 |

**写客户端必须处理**：

1. **同字段 + 标记**：解析 `<think>...` 字面，**抽出来藏起来**；只渲染标记外的 `delta.content`。
2. **独立 block**：直接拿 `delta.thinking`，**不要和 `delta.text` 混着显示**——给开发者 / 调试面板，**不**给终端用户。
3. **独立字段**：直接拿 `reasoning_content`，不要和 `delta.content` 混着显示。

**直接累加 `delta.content` 到 DOM = 把思考过程渲染给最终用户**——是这条最常见的翻车。

### 计费：reasoning_tokens 单独计

带 reasoning 的模型，`completion_tokens` **包含** thinking + 回答两部分，且 thinking 通常**单独计费**（按 reasoning 价格，**比回答贵 / 单独计价 / 部分模型不计费**，看厂商条款）。`usage` 里 `completion_tokens_details.reasoning_tokens` 是 thinking 部分。

---

## MiniMax 兼容端点的翻译层 quirk（实测发现）

**重要前提**：MiniMax / 智谱的「兼容 Anthropic」是工程上的翻译层——收到 Anthropic SDK 请求 → 翻译成 OpenAI 协议调底层模型 → 把响应翻译回 Anthropic 格式。翻译过程中各家实现取舍不同，**与海外 Anthropic 官方 Claude 行为不完全一致**。

### Quirk A：thinking 计费字段藏在 `output_tokens_details.thinking_tokens`

实测 MiniMax-M3 协议 B 端点（一次性 `messages.create` 带 `thinking: { type: "enabled", budget_tokens: 500 }`）：

```json
"usage": {
  "input_tokens": 62,
  "output_tokens": 397,
  "output_tokens_details": {
    "thinking_tokens": 196   ← 这就是 thinking 拆分！
  }
}
```

**这是 MiniMax 自己的扩展字段位置，不是 Anthropic 官方位置**。Anthropic 官方 Claude 用顶层 `usage.reasoning_tokens`。

### Quirk B：流式 `message_delta` 不报 thinking 拆分

同次流式实测（数学题 budget=500），`message_delta` 的 usage：

```json
"usage": {
  "input_tokens": 62,
  "output_tokens": 384,
  "cache_read_input_tokens": 128,
  "service_tier": "standard"
}
```

**没有 `output_tokens_details`**！一次性响应有，流式 message_delta 没有——流式无法直接拿 thinking 拆分，**要拆分只能走一次性**。

### Quirk C：不传 thinking 不出独立 block，但模型仍然思考

实测「`/api/b` 不传 thinking」：返回 `content: [{type:"text", text:"...详细计算步骤..."}]`，**没有独立 thinking block**，**usage 也没有 `output_tokens_details.thinking_tokens`**。

但 answer 本身（output_tokens=181）是详细计算步骤——说明模型**本来就会思考**，不传只是**没有显式独立 block 暴露思考过程**，思考被合并进 answer。

### Quirk D：`signature_delta` 事件

协议 B 流式 + 启用 thinking 时，会收到一个 `signature_delta` 事件（Anthropic thinking 验证签名）。客户端如果做「thinking 持久化」或「thinking 链回放」**必须保留这个签名**——否则 Anthropic 会拒绝再次发送带签名的 thinking block。MiniMax 兼容端点**也会发**这个事件（实测）。

### Quirk E：流式事件命名是 `*_delta` 后缀

- `content_block_delta.delta.type` = **`thinking_delta`** / **`text_delta`**（带 `_delta` 后缀）
- `content_block_start.content_block.type` = **`thinking`** / **`text`**（**没有后缀**）
- 客户端解析别混——判断字段最好用 `delta.thinking != null` / `delta.text != null`（看字段内容），而不是判断字符串。

---

## `budget_tokens` 是什么（soft cap，不是硬截断）

**`thinking.budget_tokens`** 是 Anthropic extended thinking 的**思考预算**——告诉模型「你最多用 N 个 token 来思考，再动笔写正文」。

```ts
client.messages.create({
  model: "MiniMax-M3",
  system: "...",
  max_tokens: 2048,                // 总输出上限 = thinking + answer 合计
  thinking: {
    type: "enabled",              // 必填：启用 extended thinking
    budget_tokens: 500            // 必填：思考预算（≤ max_tokens）
  },
  messages: [...]
});
```

**三个反直觉的事实**（实测数学题 4 组对照）：

| 组 | budget_tokens | output_tokens 合计 | output_tokens_details.thinking_tokens |
| -- | ------------- | ------------------ | -------------------------------------- |
| B0 | **不传** | 181 | 无字段（无独立 thinking block，全写进 answer） |
| B1 | **100** | 291 | **153** |
| B2 | **500** | 397 | **196** |

1. **B1 用了 153 token 思考，比 budget=100 还多**——`budget_tokens` 是**软上限**（soft cap），不是硬截断。Anthropic 设计上是「尽量不超过，但模型可以略超」，跟 `max_tokens` 那种「硬截断」不同。
2. **B2 budget=500 但只用了 196**——模型**自己判断「想到这就够了」**，不会硬凑。budget 是天花板，不是配额。
3. **B0 不传 thinking，output_tokens 仍是 181**——说明模型**本来就会思考**，不传只是**没有独立 block 暴露思考过程**，思考文本被合并进 answer。

**生活例子**——老师改作文：

- `budget_tokens: 100` ≈ 老师允许自己想 100 字（"这篇立意不错，但论据……"）
- `budget_tokens: 500` ≈ 老师允许自己想 500 字（更详细的分析）
- 学生（模型）只能想 budget 里的话；想完了才动笔写正文
- 老师想得再多，**学生作文（answer）的字数也不变**——只是**评语（thinking）**变长

**跟 max_tokens 的关系**：强约束 `budget_tokens ≤ max_tokens`，否则 Anthropic SDK 报 400。

---

## 取舍

### 什么时候选 A，什么时候选 B？

| 场景 | 推荐 | 原因 |
| ---- | ---- | ---- |
| 默认 | A | OpenAI 协议生态最广；LangChain / LlamaIndex / 各种工具默认 OpenAI 兼容 |
| 用 Anthropic 官方 Claude | B | 只有 B |
| 想用 Anthropic 的 extended thinking（独立 block） | B | A 端点是「同字段 + 标记」，要客户端自己剥 `<think>` |
| 跨多家厂商（MiniMax / 智谱 / OpenAI）想统一 | A | OpenAI 兼容几乎人手一份 |
| 已经写过 Anthropic SDK 的代码 | B | 不用改字段 |

**无论选哪个，业务代码都不该直接 `if (protocol === "A")`**——上面这表是 adapter 设计时的依据，但业务层永远写统一接口（见下文「## 适配层落地（adapter demo）」）。协议细节只活在 adapter 层。

### 生产里多协议接入怎么写？

写一个 **adapter 层**：业务用统一接口（`sendMessage(messages, options)`），底层按 env 配置（`LLM_PROVIDER` / `LLM_PROTOCOL`）路由到对应 SDK。

```ts
// 伪代码：adapter 层入口
type Provider = "openai" | "anthropic" | "minimax-anthropic" | ...;
async function sendMessage(messages, opts) {
  if (provider.protocol === "A") return openaiAdapter.send(messages, opts);
  if (provider.protocol === "B") return anthropicAdapter.send(messages, opts);
}
```

**禁止**：业务代码里写 `if (protocol === "A") { ... } else if (protocol === "B") { ... }`，每个调用点都双份——业务代码会被协议细节污染。

### thinking 计费模型（适配层要做的事）

跨三家厂商做成本统计，要处理三处不同字段位置——不能只读一个：

| 厂商 / 端点 | thinking 拆分字段位置 |
| ----------- | --------------------- |
| **Anthropic 官方 Claude** | 顶层 `usage.reasoning_tokens` |
| **MiniMax 兼容 Anthropic 端点**（一次性） | `usage.output_tokens_details.thinking_tokens`（**MiniMax 扩展字段**） |
| **MiniMax 兼容 Anthropic 端点**（流式） | **不报**——只能走一次性或用 `output_tokens` 总数估算 |
| **MiniMax 协议 A 端点** | `usage.completion_tokens_details.reasoning_tokens`（嵌 content 字符串时） |

---

## 适配层落地（adapter demo）

[apps/02-LLM-API开发/03-adapter-demo](../../../apps/02-LLM-API开发/03-adapter-demo/) 是一个最小可运行的 adapter demo——业务代码完全不碰 SDK，只调 `sendMessage(opts)`。

### 生活类比（用户原话）

> **Adapter 就是餐厅里的统一点菜接口**：
> - **客人（业务代码）** 只说："一份红烧排骨，少辣"
> - **服务员（adapter）** 接单后看：**今天谁做**（协议）—— 川菜师傅（`openai` 包）按川菜单格式下单；粤菜师傅（`@anthropic-ai/sdk`）按粤菜单格式下单
> - **菜端上来（返回值）** 服务员**统一摆盘**：菜（content）+ 配菜（thinking）+ 单据（usage），客人不管后厨是川菜粤菜

客人永远不需要知道今天是哪个师傅做、菜单格式是什么。**这就是 adapter 存在的原因**。

### Demo 文件结构

```
apps/02-LLM-API开发/03-adapter-demo/
├── adapter.ts           ← Adapter 层（types + sendViaA + sendViaB + sendMessage 入口）
├── index.ts             ← HTTP server（POST /api/chat 调 sendMessage；零业务逻辑）
├── public/
│   └── index.html       ← 前端（4 控件：协议 / budget / system / 消息 + 4 块显示区）
└── README.md
```

### 跑法

```bash
cd apps
yarn install
yarn app:02-03-adapter    # 端口 5175
```

浏览器打开 `http://127.0.0.1:5175/`；切换「协议」下拉框在 A / B 之间，看 4 块显示区（thinking / answer / usage / 原始 JSON）的字段一致——**业务层永远看不到协议差异**。

### adapter 最简形态伪代码（呼应你之前总结）

```ts
// 业务代码（永远不直接碰 SDK）
const r = await sendMessage({
  protocol: "A" | "B",                    // 选协议（其他选项默认即可）
  message: "...",
  system: "...",                          // 可选
  thinking: { type: "enabled", budget_tokens: 500 },  // 可选
});

// r 的字段（业务代码只看这 5 个）：
r.content          // 正文
r.thinking?        // 思考（如果有）
r.stopReason       // 停止原因
r.usage            // { inputTokens, outputTokens, totalTokens, thinkingTokens?, cachedTokens? }
r.protocol + r.model  // debug 用，不要 if 分支用
```

### adapter 与本节的关系

- 「字段对照速查表」「完整字段映射（10 节）」「thinking 三种字段模式」「MiniMax 兼容端点 quirk」「budget_tokens」—— **这些都是 adapter 设计的输入**
- 「取舍」段的「多协议接入怎么写」「thinking 计费模型」—— **这是 adapter 的设计原则**
- **adapter demo（apps/02-LLM-API开发/03-adapter-demo/）—— 这是 adapter 的最小可运行实现**

adapter 把上面所有学到的差异**收敛成 5 个统一字段**，业务层从此不再关心协议。本 demo 是本条（协议 A vs B）的**收口示例**——学完前面所有字段差异，最终在 adapter 里消化掉。

### 流式版本（AsyncGenerator）

`sendMessage` 是一次性版本——业务拿到完整 `UnifiedResponse`。**流式版本** `sendMessageStream` 返回 `AsyncGenerator<UnifiedDelta>`，业务用 `for await` 逐块拿 unified delta，不用关心协议。

**unified delta 类型**（discriminated union，业务只看 `type`）：

```ts
type UnifiedDelta =
  | { type: "thinking"; text: string }      // thinking 增量
  | { type: "content"; text: string }       // 正文增量
  | { type: "usage"; usage: UnifiedUsage; stopReason: string; protocol: Protocol; model: string }
  | { type: "done" };                        // 流结束
```

**业务代码（任何协议都是这一行）**：

```ts
for await (const delta of sendMessageStream(opts)) {
  switch (delta.type) {
    case "thinking": /* delta.text —— thinking 累加 */ break;
    case "content":  /* delta.text —— 正文累加 */ break;
    case "usage":    /* delta.usage + delta.stopReason —— 末帧元数据 */ break;
    case "done":     /* 流结束 */ break;
  }
}
```

**adapter 内部流式翻译的关键差异**：

| # | 协议 A 流式 | 协议 B 流式 |
| - | ---------- | ---------- |
| 数据形态 | OpenAI 字符串帧流（每帧一个 chunk JSON） | Anthropic 事件流（多种事件类型） |
| 迭代模型 | SDK `for await (chunk of stream)` | SDK callback `on("streamEvent")` + 事件队列 + Promise 桥接成 async generator |
| thinking 来源 | chunk `choices[0].delta.content` 字符串里嵌 `<think>...</think>` 标记 | 独立 `type:"thinking"` block（`content_block_delta.delta.thinking`） |
| 跨 chunk `` 处理 | **状态机**（`inThink` 标志位 + `cursor`，按 `<<think>` / `</think>` 切分 yield） | 不需要——SDK 直接给独立 block |
| usage 位置 | 末帧顶层 `usage`（需 `include_usage`） | `message_delta.usage`（**MiniMax 流式有时报、有时不报**——见下面"新发现"） |
| 结束标志 | 末帧 + `data: [DONE]` | `message_stop` 事件 + `data: [DONE]` |

**实测数据**（数学题 + budget=500）：

| 协议 | thinking delta | content delta | usage | done | 备注 |
| ---- | -------------- | ------------- | ----- | ---- | ---- |
| **A** | **28** | 3 | 1 | 1 | thinking 跨多个 chunk，状态机切分正确 |
| **B** | **12** | 3 | 1 | 1 | 独立 block 直接 yield；这次 `usage.thinkingTokens: 41` |

**新发现**：之前 [streaming-sse demo](../../../apps/02-LLM-API开发/01-Streaming-SSE/) 用数学题预算 500 测出「MiniMax 兼容端点流式 `message_delta` 不报 `output_tokens_details.thinking_tokens`」；**这次 adapter demo 用同样的简单 prompt（"23 × 47"）却报出 `thinkingTokens: 41`**。说明 MiniMax 兼容端点的流式 thinking 拆分上报**不是绝对"不报"**——跟 prompt 长度 / thinking 总量 / 模型内部决策都有关。**写客户端不能假设"流式一定有 thinkingTokens"，要做兜底**。

---

## 踩坑（10 条 + MiniMax 兼容端点 quirks）

1. **system 放错位置**——A 放 messages，B 放顶层。B 放 messages 里**直接报错**（role 不允许）。
2. **B 漏 max_tokens**——直接 400；学习阶段默认值给 1024 起步。
3. **流式写法混用**——A 是 `for await (chunk of stream) chunk.choices[0].delta.content`；B 是 `stream.on("text", t => ...)`。两者不能互换。
4. **usage 命名混写**——A 的 `prompt_tokens` / `completion_tokens` ↔ B 的 `input_tokens` / `output_tokens`；做计费统计时写错一个名字就漏算一部分。
5. **流式结束判断错位**——A 看 `data: [DONE]` 帧；B 看 `message_stop` 事件；用错标志位会提前退出或卡死。
6. **同 Key 误以为要换**——MiniMax / 智谱同 Key；海外 Anthropic 官方才是单独 Key。代码里写两套 env 是冗余。
7. **OpenAI 兼容 ≠ OpenAI 官方**——MiniMax / 智谱是「兼容」，扩展字段（`service_tier` / `base_resp`）各家不同；写客户端别假设字段只有 OpenAI 那套。
8. **Anthropic 兼容 ≠ Anthropic 官方**——MiniMax / 智谱的 `/anthropic` 端点是「能调」，底层不是真 Claude；写 extended thinking 时各家行为可能不一致。
9. **content 形态不同**——A 是 string；B 是 block 数组（每个 block 有 type）。不要假设 `response.content` 都是 string。
10. **流式 + reasoning 处理路径不同**——MiniMax-M3 的 `<think>` 标记嵌在 `delta.content` 里（协议 A）；Anthropic extended thinking 走独立 `type: "thinking"` block（协议 B）。写适配层要分别处理。

### MiniMax 兼容端点专属踩坑（详见「MiniMax 兼容端点的翻译层 quirk」章节）

- Quirk A：thinking 拆分字段在 `output_tokens_details.thinking_tokens`，不是顶层 `reasoning_tokens`
- Quirk B：流式 `message_delta` 不报 thinking 拆分，要拆分走一次性
- Quirk C：不传 thinking 不出独立 block，但模型仍然思考（answer 包含思考）
- Quirk D：`signature_delta` 是 Anthropic thinking 验证签名，做持久化必须保留
- Quirk E：流式事件名是 `*_delta` 后缀（`text_delta` / `thinking_delta`），但 `content_block.type` 没后缀——别混

---

## 我追问过的

- **问了：为什么 Anthropic 的没有返回思考内容？** → 答：分两层。
  - 第一层：协议 B 流式 `messages.stream()` 默认**不传 thinking 参数**，所以 SDK 不启用 extended thinking block。**思考过程被合并进 `content_block_delta.delta.text`**（看起来「直接给答案」）。
  - 第二层：即便**传了 thinking 参数**，MiniMax 兼容 Anthropic 端点的 thinking 拆分字段也**不在顶层 `reasoning_tokens`**——藏在 `output_tokens_details.thinking_tokens`（MiniMax 扩展字段），流式 `message_delta` 里**根本不报**（只报 `output_tokens` 总数）。
  - 验证：跑 think-test.ts 4 组对照（A 不带 / B 不带 / B 带 100 / B 带 500），结论：
    1. A 不带 = content 字符串嵌 `<think>...` 标记 + `completion_tokens_details.reasoning_tokens: 188`
    2. B 不带 = content block 数组只有 text，无独立 thinking block，无 thinking 拆分字段
    3. B 带 100 = 独立 thinking block + `output_tokens_details.thinking_tokens: 153`（用了 153 token 思考，**略超 budget=100**，软上限）
    4. B 带 500 = 独立 thinking block + `output_tokens_details.thinking_tokens: 196`（用了 196 token 思考，**没用满 budget=500**，模型自判）

- **追问链：`thinking_tokens` 字段在哪？** → 三轮才问清。
  - 第一轮：以为 B 端点没拆 thinking，全算 output_tokens。
  - 第二轮：跑 `/api/think-compare` 一次性响应，发现 `output_tokens_details.thinking_tokens` 字段（B 端点确实有 thinking 拆分，只是字段位置与 Anthropic 官方不同）。
  - 第三轮：跑 `/api/b-thinking-stream` 流式响应，发现 `message_delta.usage` 里**完全没有 thinking 拆分字段**——只有 `output_tokens: 384` 总数。所以**流式无法直接拿 thinking token 数**，要拆分只能走一次性（output_tokens - answer_tokens 用 tiktoken 估算）。
  - 结论：**适配层写成本统计面板要处理四种位置**：Anthropic 官方顶层 `reasoning_tokens` / MiniMax 兼容端点一次性 `output_tokens_details.thinking_tokens` / MiniMax 兼容端点流式（不报） / MiniMax 协议 A 端点 `completion_tokens_details.reasoning_tokens`。

- **追问：budget 参数是干嘛的？** → `thinking.budget_tokens` 是 Anthropic extended thinking 的思考预算——告诉模型「最多用 N 个 token 来思考」。实测 4 组数据揭示三个反直觉事实：
  1. 是**软上限**（soft cap），不是硬截断（B1 budget=100 但用了 153）
  2. 模型**自己判断够不够**——B2 budget=500 只用 196，不硬凑
  3. 不传 thinking ≠ 模型不思考——B0 没传参数，output_tokens=181 是详细计算步骤，**模型本来就会思考**，只是没显式独立 block 暴露
  - **强约束**：`budget_tokens ≤ max_tokens`，否则 400。
  - **生活类比**：老师改作文——`budget_tokens: 100` 老师允许自己想 100 字评语；`budget_tokens: 500` 允许想 500 字；学生作文（answer）字数不变，只是评语（thinking）变长。

---

## 过关自检

合上文件能讲清：

1. **协议 A vs B**——A 是 OpenAI Chat Completions（`openai` 包 + `chat.completions.create`），B 是 Anthropic Messages API（`@anthropic-ai/sdk` + `messages.create` / `messages.stream`）。
2. **同 Key 换协议**——MiniMax / 智谱各暴露双协议，**同 Key 只换 baseURL**（A 走 `/v1`，B 走 `/anthropic`）。
3. **system 位置**——A 放 `messages` 里 `{role: "system", content}`；B 放顶层 `system` 参数（**不在 messages 里**）。
4. **max_tokens 必填性**——A 可选；B **必填**。
5. **流式字段**——A 每帧拿 `choices[0].delta.content` 字符串累加；B 是事件流，文本在 `content_block_delta.delta.text`，要订阅 `text` 事件或 `event` 自己 switch。
6. **usage 命名**——A `prompt_tokens` / `completion_tokens`；B `input_tokens` / `output_tokens`；语义对应，名字不同。
7. **结束标志**——A 流式看 `data: [DONE]` 帧（OpenAI 协议）；B 流式看 `message_stop` 事件。
8. **「兼容」≠「官方」**——MiniMax / 智谱的兼容端点不是真 OpenAI / 真 Claude；扩展字段各家不同；thinking 计费字段位置也不同（MiniMax 兼容端点在 `output_tokens_details.thinking_tokens`，不在 Anthropic 官方顶层 `reasoning_tokens`）。
9. **thinking 三种字段模式**——同字段+标记 / 独立 block / 独立字段；不同厂商模型用不同模式；客户端不能假设。
10. **budget_tokens 是软上限**——不是硬截断；模型可以略超但不会硬凑；`budget_tokens ≤ max_tokens` 强约束。

---

## 还没搞懂的

- 协议 B 端点如果主动传 `thinking: { type: "enabled", budget_tokens: N }` 在 MiniMax Anthropic 兼容端点上的边界（最小 budget / 最大 budget / 拒绝条件）→ 模块 11 State / Workflow 详说。
- 流式 `message_delta` 不报 thinking 拆分——是 MiniMax 兼容端点的 quirk，还是 Anthropic SDK 本身就不报？（要拿海外 Anthropic 官方 Claude 对照）→ 模块 18 Observability + 模块 23 Production Architecture 详说。
- `signature_delta` 事件在 MiniMax 兼容端点的具体格式与官方 Anthropic 是否一致——持久化方案可能不同 → 模块 23 详说。
- 跨三家厂商做统一 thinking 截取接口（adapter 层）的最佳抽象方式 → 模块 13 Agent Framework + 模块 23 详说。
