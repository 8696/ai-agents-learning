# Demo · 协议 A vs B（用真实线上对话对照）

对应：[模块 02 · LLM API 开发](../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md)

本条必须看见的：
1. **同一把 Key**，协议 A（openai SDK + `api.minimaxi.com/v1`）与协议 B（`@anthropic-ai/sdk` + `api.minimaxi.com/anthropic`）**并行跑同一 prompt**
2. **流式帧结构不同**：A 是 `choices[0].delta.content` 字符串；B 是事件流 `content_block_delta.delta.text`
3. **一次性响应字段不同**：A 是 `choices[0].message.content`（string）+ `finish_reason`；B 是 `content[0].text`（block）+ `stop_reason`
4. **usage 命名不同**：A 是 `prompt_tokens` / `completion_tokens`；B 是 `input_tokens` / `output_tokens`
5. **system 位置不同**：A 放 `messages` 数组里；B 放顶层 `system` 参数
6. **thinking 字段位置不同**（进阶）：A 嵌在 content 字符串里 + `completion_tokens_details.reasoning_tokens`；B 独立 `type="thinking"` block + `output_tokens_details.thinking_tokens`（**MiniMax 扩展字段，不是 Anthropic 官方顶层 `reasoning_tokens`**）

## 跑法

```bash
cd demos
yarn install
yarn demo:02-protocol-ab
```

跑起来后浏览器打开 `http://127.0.0.1:5174/`，从**最上面到最下面**依次有 4 个面板（h1 标题下直接进入 thinking 差异对照）：

| 顺序 | 面板 | 端点 | 用途 |
| ---- | ---- | ---- | ---- |
| 1 | **thinking 差异对照** | `/api/think-compare` | 4 组一次性 + 6 维度对照表，**重点看 thinking 单独计费字段位置** |
| 2 | **流式协议 A** | `/api/a-stream-raw` | OpenAI chunk 原样转发 + meta `kind`（role/chunk/finish/usage），看 A 的字符串帧流 |
| 3 | **流式协议 B + 启用 thinking** | `/api/b-thinking-stream` | Anthropic 完整事件流，看 thinking block + text block + signature_delta + message_delta |
| 4 | **流式协议 B（不启用 thinking）** | `/api/b-stream-raw` | 与 3 形成「B 有/无 thinking」对照——这次事件序列里**没有 thinking block** |

`Ctrl+C` 退出。后端控制台同步打印每一帧的摘要。

## 端点对照

| 端点 | 协议 | SDK | 流式 | 调 API | 用法 |
| ---- | ---- | --- | --- | ------ | ---- |
| `POST /api/a` | A · OpenAI Chat Completions | `openai` | ✅ SSE | ✅ MiniMax-M3 | 单边流式（curl 直接调；前端面板未展示） |
| `POST /api/b` | B · Anthropic Messages | `@anthropic-ai/sdk` | ✅ SSE | ✅ MiniMax-M3 | 单边流式（curl 直接调；前端面板未展示） |
| `POST /api/compare` | A + B 同时 | 两个 SDK | ❌ 一次性 | ✅ | 一次性两侧完整 JSON（curl 直接调；前端面板未展示） |
| `POST /api/think-compare` | **A 不带 + B 不带 + B 带 100 + B 带 500** | 两个 SDK | ❌ 一次性 | ✅ | **thinking 差异对照（4 组一次性，看 6 维度差异）** ← 面板 1 |
| **`POST /api/a-stream-raw`** | **A 流式** | `openai` | ✅ SSE | ✅ | **协议 A 流式原样转发（role/chunk/finish/usage 四类帧）** ← 面板 2 |
| **`POST /api/b-thinking-stream`** | **B + 启用 thinking** | `@anthropic-ai/sdk` | ✅ SSE | ✅ | **协议 B 流式 + 启用 thinking（看完整事件流：thinking block + text block + message_delta）** ← 面板 3 |
| **`POST /api/b-stream-raw`** | **B 不启用 thinking** | `@anthropic-ai/sdk` | ✅ SSE | ✅ | **协议 B 流式原样转发（与 b-thinking-stream 形成 B 端点有/无 thinking 对照）** ← 面板 4 |
| `GET /` | — | — | — | — | 浏览器对比页 |
| `GET /health` | — | — | — | — | 当前 baseURL / model |

`/api/a` / `/api/b` / `/api/compare` / `/api/think-compare` / `/api/a-stream-raw` / `/api/b-stream-raw` 用**同一份请求体**：`{ "message": "...", "system": "..." }`。`/api/b-thinking-stream` 多一个 `thinking_budget`（默认 500）。

### 四向对照：A/B × 带/不带 thinking

| | **不带 thinking** | **带 thinking** |
| -- | --- | --- |
| **协议 A** | `/api/a-stream-raw` · **81 帧**（chunk 78 + role/finish/usage）— A 默认就有 thinking，嵌在 `delta.content` 字符串里 | (A 没法"关掉" thinking —— `<think>` 总是嵌在 content 里；只能客户端剥) |
| **协议 B** | `/api/b-stream-raw` · **48 事件**（text_delta 43，无 thinking） | `/api/b-thinking-stream` · **223 事件**（19 thinking_delta + 196 text_delta + signature_delta） |

**一目了然看出四件事**：

1. **A 默认就有 thinking**（81 帧里 chunk 含 `<think>...</think>` 标记）
2. **B 默认没 thinking**（48 事件全是 text_delta）
3. **B 启用 thinking 时事件数爆涨**（48 → 223，约 4.6 倍），且多出 `signature_delta` + 双 block
4. **A 是字符串帧流**（每帧一个 OpenAI chunk JSON）；**B 是事件流**（多事件类型）

## 协议 A vs B 字段映射速查表（写适配层用）

完整 10 节详细对照表见 [小节 MD](../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md#完整字段映射写适配层详细版)。下面是精简版。

### 请求侧

| 维度 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| **入口** | `client.chat.completions.create({...})` | `client.messages.create({...})` 或 `.stream({...})` |
| **system** | `messages[0] = {role:"system", content}` | 顶层 `system: "..."` |
| **max_tokens** | 可选 | **必填** |
| **stream** | `stream: true` | 改用 `.stream()` 方法（不传 stream 字段） |
| **stop** | `stop: "..."` | `stop_sequences: ["..."]` |
| **user** | `user: "..."` | `metadata: { user_id: "..." }` |
| **流式 usage** | `stream_options: { include_usage: true }` | 自动（`finalMessage()`） |
| **thinking** | ❌ 不支持 | 顶层 `thinking: { type:"enabled", budget_tokens:N }` |

### 响应侧（非流式）

| 维度 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| **role** | `choices[0].message.role` | 顶层 `role` |
| **content** | `choices[0].message.content`（**string**） | `content: [{type:"text", text:"..."}]`（**block 数组**） |
| **stop** | `choices[0].finish_reason` | 顶层 `stop_reason` |
| **usage 输入** | `prompt_tokens` | `input_tokens` |
| **usage 输出** | `completion_tokens` | `output_tokens` |
| **usage 总量** | `total_tokens` | ⚠️ 无，自己 `input+output` 算 |
| **usage reasoning** | `completion_tokens_details.reasoning_tokens` | 一次性：`output_tokens_details.thinking_tokens`（MiniMax 兼容）/ `reasoning_tokens`（Anthropic 官方顶层） |

### 响应侧（流式）

| 维度 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| **基本单元** | 1 帧 = 1 个 OpenAI chunk JSON | 1 事件 = 1 个 Anthropic event JSON |
| **文本字段** | `choices[0].delta.content` | `content_block_delta.delta.text` |
| **delta 字段命名** | `delta.content`（**没后缀**） | `delta.text` + `delta.type="text_delta"`（**有 `_delta` 后缀**） |
| **finish / stop** | `choices[0].finish_reason`（某帧） | `message_delta.delta.stop_reason` |
| **usage 位置** | 末帧顶层 `usage`（需 `include_usage`） | `message_delta.usage`（**MiniMax 流式不报 thinking 拆分**） |
| **结束标志** | `data: [DONE]\n\n` | `message_stop` 事件 + `data: [DONE]\n\n` |
| **thinking 字段位置** | 嵌 `delta.content` 字符串里（`<think>` 标记） | 独立 `content_block_delta.delta.thinking` 字段 |
| **signature 验证** | ❌ 无 | ✅ `signature_delta` 事件（持久化必保留） |

---

## 各端点重点

### `/api/think-compare` 重点

**解决的核心问题**：协议 A vs B 在「thinking」这件事上的差异是分散在多处的——前端写个对比表能讲清。**跑一次 `/api/think-compare` 看全 4 组 × 6 个差异点**：

| 差异点 | 看什么 |
| ------ | ------ |
| 1. content 形态 | A 是 `string`；B 是 `block[]` |
| 2. thinking 位置 | A 嵌在 content 字符串（`<think>` 标记）；B 是独立 `type="thinking"` block |
| 3. usage 字段命名 | A 的 `prompt/completion`；B 的 `input/output` |
| 4. thinking 单独计费？ | A：顶层 `completion_tokens_details.reasoning_tokens`；B：藏在 `output_tokens_details.thinking_tokens`（MiniMax 扩展字段，**不是** Anthropic 官方顶层 `reasoning_tokens`） |
| 5. 答案长度 | 字符数对比（剥 thinking 之后） |
| 6. finish/stop 字段 | A 的 `finish_reason`；B 的 `stop_reason` |

**前端展示**：4 张卡片（每张 = 一个场景，含 answer / thinking / usage / finish_reason） + 6 行差异对照表（高亮第 4 行）。

### `/api/a-stream-raw` 重点

**解决的核心问题**：`/api/a` 流式只发纯 `data:` 帧，前端没法分类看。`/api/a-stream-raw` 每帧多发一个 `meta.kind`（`role` / `chunk` / `finish` / `usage`），前端按 kind 着色，逐帧分类展示：

- **role**（蓝）：首帧，只有 `delta.role="assistant"`，无 content
- **chunk**（黑）：增量文本帧，含 `delta.content`（可能含 `<think>...</think>` 标记）
- **finish**（橙）：含 `choices[0].finish_reason`（如 `"stop"`）+ `delta.role`（无 content）
- **usage**（绿）：纯 usage 帧（choices 空，usage 完整）——**A 端点的 thinking 拆分就在这里**：`completion_tokens_details.reasoning_tokens`

**实测数学题 81 帧**：1 role + 78 chunk + 1 finish + 1 usage。

**前端展示**：三栏 —— 事件流（按 kind 着色）/ thinking 累加（从 `delta.content` 字符串里正则提取 `<think>...</think>`，紫灰斜体）/ answer 累加（剥 `<think>` 后的内容，黑）/ 底部 usage 元数据。

### `/api/b-thinking-stream` 重点

**解决的核心问题**：`/api/b`（不带 thinking）只能看到 `text` block 的流式事件。**带 thinking 时流式事件序列会变成两段**（先 thinking block，再 text block），前端用这个端点能实时看到：

- **事件序列（实测 223 个事件，数学题 budget=500）**：
  - `message_start` × 1
  - `content_block_start` × 2（`type: "thinking"` + `type: "text"`）
  - `content_block_delta` × 215（**19 个 `thinking_delta`** + **196 个 `text_delta`**）
  - `content_block_stop` × 2
  - `signature_delta` × 1（Anthropic thinking 验证签名，MiniMax 兼容端点也会发）
  - `message_delta` × 1（usage + stop_reason）
  - `message_stop` × 1

- **重要事件名差异**：事件内 `delta.type` 实际是 `thinking_delta` / `text_delta`（**带 `_delta` 后缀**）；但 `content_block.type` 是 `thinking` / `text`（**没有后缀**）。客户端解析别混——判断最好用 `delta.thinking != null` / `delta.text != null`（看字段内容）。

- **MiniMax 流式端点的另一个 quirk**：流式 `message_delta` 的 `usage` **不报 `output_tokens_details.thinking_tokens`**（与一次性响应不同）——要拆分只能走一次性 `/api/think-compare`。

**前端展示**：三栏 —— 事件流（按顺序 + 类型着色 + 时间戳）/ thinking 累加（紫）/ answer 累加（蓝）/ 底部 usage 元数据。

### `/api/b-stream-raw` 重点

**解决的核心问题**：与 `/api/b-thinking-stream` 形成「B 端点有/无 thinking」对照。**这次 B 不启用 thinking**——事件序列里应**没有 thinking block**。

- **事件序列（实测 48 个事件，数学题不启用 thinking）**：
  - `message_start` × 1
  - `content_block_start` × 1（**只有 type=text**）
  - `content_block_delta` × 43（**全部 delta.type=text_delta**，无 thinking_delta）
  - `content_block_stop` × 1
  - `message_delta` × 1（usage + stop_reason；**usage 里无 thinking 拆分字段**）
  - `message_stop` × 1

- **关键观察**：中栏"thinking 累加"始终保持空（明确标注「不启用 thinking，此面板永远为空」）。

**前端展示**：三栏布局与 `/api/b-thinking-stream` 一致（方便并排对照），但事件数从 223 降到 48，且**没有 signature_delta + 没有双 block**。

## 文件结构

```
02-协议-A-vs-B/
├── index.ts             ← 后端：HTTP server（7 个端点）
│                            - /                   静态对比页（5 个面板）
│                            - /health             配置信息
│                            - /api/a              协议 A 流式（流式对照面板用，简化）
│                            - /api/b              协议 B 流式（流式对照面板用，事件流）
│                            - /api/compare        A + B 一次性完整 JSON
│                            - /api/think-compare  4 组 thinking 差异对照（一次性）
│                            - /api/a-stream-raw   A 流式原样转发 + meta kind
│                            - /api/b-thinking-stream  B 流式 + 启用 thinking（完整事件流）
│                            - /api/b-stream-raw   B 流式不启用 thinking（事件流）
├── think-test.ts         ← 一次性实验脚本：流式版本 4 组对比（不依赖 server）
├── public/
│   └── index.html       ← 前端（4 个面板，从上到下）：
│                          1. thinking 差异对照（4 卡片 + 6 行差异表）
│                          2. 流式协议 A（事件流 + thinking 累加 + answer 累加 + usage）
│                          3. 流式协议 B + 启用 thinking（三栏布局）
│                          4. 流式协议 B（不启用 thinking）（三栏布局）
└── README.md
```

## 与 streaming-sse demo 的关系

- **streaming-sse**：单协议（仅 A）跑流式，看帧长什么样 / 真实 batching；含模拟版与真实版
- **协议 A vs B（本 demo）**：双协议同 prompt 并行 + 多端点（流式 / 一次性 / thinking 对照 / 流式拆解），看**协议差异**（字段、命名、system 位置、事件模型、thinking 计费位置）

不重复 streaming-sse 已经教过的东西（`\n\n` 切帧 / buffer 累加 / `[DONE]` 结束帧等）；本 demo 重点是「并排对照 + 流式拆解」。

## 跑前需要

`apps/.env` 填 `MINIMAX_API_KEY`（模块 00 已有）；智谱 / OpenAI Key 兼容 OpenAI 协议也行（MiniMax / 智谱都暴露双协议）。**不用为协议 B 单独申请 Key**——同 Key 只换 baseURL。
