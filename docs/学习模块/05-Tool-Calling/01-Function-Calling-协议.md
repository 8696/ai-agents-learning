# **Function Calling 协议**：model → tool_call → execute → tool_result → model

> 对应模块：[模块 05 · Tool Calling / Function Calling ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 1 条

- **来源**：
  - 本对话主讲（`coach start` 详解 + 5 用例 HTTP Demo 实测，含协议 A vs B 字段差异 + 并行/串行 + Zod 修复闭环 + 工具执行失败回传）
  - 本轮追加（2026-09-03）：⑥ 差旅助手 4-5 轮混合业务流（trip_weather / trip_exchange / trip_attractions / trip_flights / trip_hotels）+ z.coerce.number() 工程修法
  - 04 条已沉淀：[02-JSON-Mode-vs-Structured-Output.md](../04-Structured-Output/02-JSON-Mode-vs-Structured-Output-step-1.md)（协议 A/B 字段对齐 + Zod 单一来源）
  - 01 条已沉淀：[01-JSON-Schema.md](../04-Structured-Output/01-JSON-Schema-step-1.md)（Zod → JSON Schema 派生 + repair 闭环）
  - [OpenAI function calling guide](https://platform.openai.com/docs/guides/function-calling) · [Anthropic tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- **状态**：Demo 已落 / 沉淀已写（2026-09-03）· 待勾 ✅
- **Demo**：`apps/05-Tool-Calling/01-Function-Calling-协议/`（HTTP，端口 `50501`，`yarn app:05-01-function-calling-protocol`）· 9 个 Tool（calculator / weather / db / search + 5 个 trip_*），含 ⑥ 差旅助手 4-5 轮混合业务流；详见 §5.2 Demo 判断块

---

## 一句话讲清

**Function Calling** 是让模型不只吐"答案文字"，而是吐"**调用指令 + 参数 JSON**"——服务器拿到指令去执行，再把结果喂回模型，模型继续。协议 A（OpenAI）叫 `function calling`；协议 B（Anthropic）叫 `tool use`——同一件事，**字段名和回灌形态不同**。这是 Agent 行为的入口点；**Tool 是 Agent 唯一的"外部能力"**——模型本身只能吐文字，调 API / 读 DB / 写文件都靠 Tool。

---

## 完整一圈 · 数据怎么走

### Round 1 · 模型决策

```
User: "北京今天天气怎么样？美元对人民币多少？"
   ↓
┌────────────────────────────────────────┐
│ LLM 看到 tools 列表 + 描述 + schema     │
│ 决定要调 get_weather + get_fx           │
│ 返回 tool_calls 数组（不是答案）        │
└────────────────────────────────────────┘ ↓
res.choices[0].finish_reason === "tool_calls"
res.choices[0].message.tool_calls === [
  { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"北京"}' } },
  { id: "call_2", type: "function", function: { name: "get_fx",       arguments: '{"from":"USD","to":"CNY"}' } },
]
```

**关键**：模型返回的是**指令**不是**结果**。服务端**不能**拿 `message.tool_calls` 当答案给用户——必须接着执行。

### Round 1 执行 · 客户端解析 + 跑

```ts
const toolResults = await Promise.all( // ← 并行（关键！见 §并行调用）
  res.choices[0].message.tool_calls.map(async (tc) => {
    // ① 拿 name 去 registry 找 handler
    const tool = registry.get(tc.function.name);
    if (!tool) return errorResult(tc.id, `未知工具 ${tc.function.name}`);

    // ② Zod 校验参数（不合法直接回传模型 repair，参考 04 条踩坑 #3）
    const parsed = tool.input.safeParse(JSON.parse(tc.function.arguments));
    if (!parsed.success) return errorResult(tc.id, `参数错误: ${parsed.error.issues[0].message}`);

    // ③ 执行 handler（Gateway 钩子在这 — 04 条会展开）
    try {
      const out = await tool.handler(parsed.data, { toolCallId: tc.id });
      return { tool_call_id: tc.id, role: "tool", content: JSON.stringify(out) };
    } catch (err) {
      // ④ 错误回传模型（不要抛异常终止循环）
      return errorResult(tc.id, `执行失败: ${(err as Error).message}`, is_error: true);
    }
  })
);
```

**三件不要混的事**：(1) 解析 tool_call 字符串 → JSON；(2) Zod 校验 JSON → typed；(3) 跑 handler → 出结果。**每一层失败都把错误回传模型做 repair**（04 条已沉淀的"五步闭环"）。

### Round 2 · tool_result 回灌 + 模型再决策

```
[history..., assistant_message_with_tool_calls, ...tool_results]
   ↓
┌────────────────────────────────────┐
│ LLM 看到工具输出，决定下一步        │
│  ├→ 返回 stop + content → 给用户    │
│  ├→ 返回 tool_calls → 再循环       │
│  └→ 返回 length → 截断 /加 token │
└────────────────────────────────────┘
   ↓
final.choices[0].finish_reason === "stop"
final.choices[0].message.content === "北京今天晴25°C；1 USD ≈ 7.25 CNY。"
```

**关键**：tool_result **是给模型看的**，不是给用户看的——用户只看到模型基于 tool_result 组织的**最终答案**。

### 终止条件决策表

| `finish_reason` (A) / `stop_reason` (B) | 含义 | 动作 |
| --- | --- | --- |
| `stop` / `end_turn` | 模型给最终答案 | **终止**——返回 `message.content` |
| `tool_calls` / `tool_use` | 模型要继续调 | **循环**——执行 → 回灌 → 再调 |
| `length` | token 不够被截断 | 增加 `max_tokens` / 分块 |
| `content_filter` / `safety` | 安全拦截 | 告诉用户"无法回答"，**不要**当成功 |

---

## ⑥ 真实业务流 · 差旅助手（4-5 轮混合）

> 这是 ①②③「3-轮以内」教学点的延伸：用**一个真实业务流**演示模型怎么把「并行 + 串行」自然混合。决定权在模型，不在代码。

**场景**：用户说「我下周去东京 5 天，预算 1.5 万人民币，帮我出份行程单」——同时涉及查天气、汇率、景点、机票、酒店。模型怎么拆？

### 预期流程（实际轮数由模型决定）

```
Round 1（并行）：trip_weather(东京) + trip_exchange(CNY,JPY) + trip_attractions(东京)
   └─ 这 3 件事互相不依赖 → 一轮里并行，省 2 次往返
Round 2（串行）：trip_hotels(东京, 5, 预算换算后)
   └─ 要等 R1 的汇率换算预算，否则不知道 per_night 给多少 → 必须串行
Round 3（并行 / 串行 看模型）：trip_flights(北京, 东京, ...)
   └─ 看模型决定是否同时查酒店
Round N（终态）：finish_reason=stop → final content = 行程单
```

### 实测数据（MiniMax-M3 · 协议 A）

| Round | tool_call | finish_reason | 含义 |
| ----- | --------- | ------------- | ---- |
| R1 | **3**（并行） | `tool_calls` | trip_weather + trip_exchange + trip_attractions 同时跑 |
| R2 | 1（串行） | `tool_calls` | 等 R1 的汇率才能算酒店预算 |
| R3 | 1（串行） | `tool_calls` | 继续依赖 |
| R4 | 1（串行） | `tool_calls` | 继续依赖 |
| R5 | 0 | **`stop`** | 出最终行程单 |

**totalRounds=5 · elapsedMs=23499**。对应教学点：

| 看什么 | 在页面哪里 | 代表什么 |
| ------ | ---------- | -------- |
| totalRounds | 卡片右上 | 串行依赖的次数 |
| 每轮 `· N 个 tool_call` | RoundCard 标题徽标 | 这一轮并行几件事 |
| `finish_reason=tool_calls`（蓝）vs `stop`（绿）| RoundCard 标题徽标 | 继续 / 终止 |

**为什么模型会自然产生 4-5 轮**——因为「先查后算」是真实业务的常态：拿到汇率才能换算预算、拿到预算才能选酒店档位、拿到所有项才能组装行程。**轮数不是模型慢，是业务有依赖**。

### System Prompt 的隔离

新 5 个 Tool 与旧 4 个 Tool 同时注册到 registry（共 9 个）。两端各用自己的 system prompt 引导：

| 端点 | system prompt 引导 | 调用的 tool 子集 |
| ---- | ------------------ | ---------------- |
| `/api/run`、`/api/run-serial` | 「你可以使用工具（add / get_weather / lookup_user / search_wiki）」 | 旧 4 个 |
| `/api/run-realistic` | 「能用的工具只有 5 个：trip_*；不要调用其他工具」 | 新 5 个 |

→ System prompt 是工具子集的「菜单」，**不是装饰**——同一份 Registry，不同 system prompt 切出不同业务流。

---

## 并行调用 · 本条核心易错

**模型可能一次返回多个 tool_calls**——它们之间**互相不依赖**就**必须并行**（`Promise.all`），不是串行 `for await`。

### 怎么判"并行 vs 串行"？

```
get_weather("北京") + get_fx("USD","CNY")   ← 没数据依赖，并行
          ↓
get_user_orders(user_id)                    ← 后置：要知道 user_id
 ↓
cancel_order(order_id)                      ← 依赖上一步的 order_id，串行
```

> **方法**：看 call 之间**输出有没有被另一条输入消费**。没消费 → 并行；有消费 → 串行。

### 协议 A vs 协议 B 在并行调用上的形态差

| 维度 | 协议 A（OpenAI） | 协议 B（Anthropic） |
| --- | --- | --- |
| 返回结构 | `message.tool_calls: ToolCall[]`（**本身就是并行数组**） | `content: ContentBlock[]`（**混杂** `text` + 多个 `tool_use`） |
| 提取 | 直接遍历 `tool_calls` | `content.filter(b => b.type === "tool_use")` |
| 工具结果回灌 | 每个 tool_result **一条 message**（`role: "tool"`，带 `tool_call_id`） | **一条 user message 里 `content` 是 tool_result 数组**（每条带 `tool_use_id`） |
| arguments 形态 | **字符串** → `JSON.parse` | **对象**（`block.input`）→ 不要 parse |
| `max_tokens` | 不必填 | **必填**（参考 04 条踩坑 #7） |

⚠️ **协议 B 三连坑**：
1. `content` 是数组不是对象——直接 `res.text` 不存在；`for-of + if (block.type === ...)` 才对。
2. **filter 后并行**——别忘了 `Promise.all`。
3. 回灌时**整段 `content` 数组**作为一条 `assistant` message 追加（保留 text + tool_use 顺序），tool_result 用**一条** user message 的 content 数组传回。

---

## 协议 A vs B 在 Function Calling 上的完整字段差异

| 维度 | 协议 A（Chat Completions） | 协议 B（Messages） |
| --- | --- | --- |
| 入口字段 | `tools: [{ type: "function", function: { name, description, parameters } }]` | `tools: [{ name, description, input_schema }]`（**顶层，不是嵌套 function**） |
| 模型响应 | `choices[0].message.tool_calls: ToolCall[]` | `content: ContentBlock[]`（含 `text` + `tool_use`） |
| 工具结果回灌 | 每条 tool 一条 `{ role: "tool", tool_call_id, content }` | 一条 `{ role: "user", content: [{ type: "tool_result", tool_use_id, content, is_error? }] }` |
| `tool_choice` | `{ type: "function", function: { name } }` 强制调指定 | `{ type: "tool", name }` 强制调指定（参考 04 条 B3） |
| `is_error` 字段 | 不支持——错误只能写 `content` 里 | 支持 `{ type: "tool_result", is_error: true, content }`——**更显式** |
| `max_tokens` | 不必填 | **必填** |

---

## 为什么 Agent 开发要懂（不懂的 5 个具体翻车）

1. **把 `tool_call` 当"已执行"上报**。模型返回的是"我想调什么"，不是"已经做完了"。把 tool_call 当成功事件上报业务事件——实际 handler 还没跑，业务流程全空。
2. **全串行执行并行 tool_calls**。模型一次返回多个 tool_call 没数据依赖——必须 `Promise.all`。全 `for await` 串行导致首 token 延迟翻倍；用户体感"卡"，体感差 5–10 秒。
3. **错误抛异常终止整个调用链**。handler `throw new Error(...)` 没被 catch → 整个 koa 接口 500 → 用户拿到一片空白。**修法**：catch 块把错误包成 `tool_result` 回传模型（带 `is_error: true`），让模型决定重试或换路径。本 demo ⑤ 用例实测：模型收到错误后**主动重试**了一次再 stop。
4. **`finish_reason="tool_calls"` 当 stop 截断**。模型想继续调工具，你把它当成终态返回——下游少一步结果。
5. **`tool_result` 原样 echo 给用户**。把内部 JSON 错误细节暴露给用户——既泄露格式、又难看。**tool_result 是给模型看的，不是给用户看的**。

---

## 易混点

| 易混对 | 差在哪 | 判错代价 |
| --- | --- | --- |
| **tool_call ≠ 已执行** | tool_call 是"模型发出的指令"，不是"已经执行完" | 把模型请求当成功事件上报——实际没执行，业务掉了 |
| **并行 vs 串行** | 看数据依赖；没依赖必须 `Promise.all` | 全串行 → 首 token 延迟翻倍 |
| **`finish_reason="tool_calls"` vs `"stop"`** | tool_calls → 循环；stop → 终止 | 把 tool_calls 当 stop 截断 → 模型想继续调被你拦了 |
| **协议 A `arguments` 字符串 vs 协议 B `input` 对象** | A 要 `JSON.parse`；B 已经是对象 | B 路径 `JSON.parse` 抛错（对象解析失败） |
| **tool_result 是给模型的不是给用户的** | 用户看不到 tool_result 原文 | 把 tool_result 原样 echo 给用户——泄露内部错误细节 |
| **Tool 是 Agent 唯一的"外部能力"** | 模型本身只能吐文字 | 想"让模型自己写文件"——不可能，必须给 `write_file` tool |
| **错误回传 ≠ 抛异常终止** | Zod 错 / 工具错都包成 tool_result（含 `is_error: true`） | 抛异常整个循环挂了——用户得到一个 500 |

---

## 例子

### 通俗例子 · 医疗转诊

```
医生（model）面对患者
   ↓ Round 1：医生看症状，开两张检查单（tool_calls）
[血常规 + CT]  ←─ 模型一次返回 2 个 tool_call，互相不依赖
   ↓ Round 1 执行：护士并行带患者去抽血 + 拍 CT（Promise.all）
   ↓ Round 2：医生拿到两份报告（tool_results），综合判断
   ↓ 给患者最终诊断（stop + content）
```

→ 患者看到的是「医生的诊断 + 建议住院」，**看不到**检查单的 JSON、报告的原文、Tool 错误细节。

### 真实代码（协议 A · 同意图）

```ts
// Round 1
const res = await llm.openai.chat.completions.create({
  model: llm.modelA,
  messages: [
    { role: "system", content: "你可以用工具查天气和汇率。" },
    { role: "user", content: "北京今天天气怎么样？美元对人民币多少？" },
  ],
  tools: [
    { type: "function", function: {
      name: "get_weather",
      description: "查某城市当前天气",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    }},
    { type: "function", function: {
      name: "get_fx",
      description: "查货币汇率",
      parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
    }},
  ],
});
// res.choices[0].message.tool_calls  ← 并行结构，直接 map + Promise.all

// Round 1 执行（并行）
const toolResults = await Promise.all(/* ... 见 §Round 1 执行 ... */);

// Round 2 · 终止
const final = await llm.openai.chat.completions.create({
  model: llm.modelA,
  messages: [...history, res.choices[0].message, ...toolResults],
});
// final.choices[0].finish_reason === "stop"
```

### 真实代码（协议 B · 同意图）

```ts
// Round 1
const res = await llm.anthropic.messages.create({
  model: llm.modelB,
  max_tokens: llm.maxTokensB, // ← 必填
  system: "你可以用工具查天气和汇率。",
  tools: [
    { name: "get_weather", description: "查某城市当前天气",
      input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    { name: "get_fx", description: "查货币汇率",
      input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] } },
  ],
  messages: [{ role: "user", content: "北京今天天气怎么样？美元对人民币多少？" }],
});
// res.content === [text?, tool_use, tool_use, ...]  ← filter 后并行

// Round 1 执行（并行）
const toolUses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
const toolResults = await Promise.all(/* ... 每条 tool_use → tool_result ... */);

// Round 2 · 终止（一整条 assistant 数组 + 一条 user 数组）
const final = await llm.anthropic.messages.create({
  model: llm.modelB,
  max_tokens: llm.maxTokensB,
  system: "你可以用工具查天气和汇率。",
  tools: [...],
  messages: [
    { role: "user", content: "北京今天天气怎么样？美元对人民币多少？" },
    { role: "assistant", content: res.content },        // 整段数组保留
    { role: "user", content: toolResults },             // 一条 user 内 tool_result 数组
  ],
});
```

### Tool Registry · 动手落点（最小骨架）

按 README 验收「**有一个 Tool Registry，新增 Tool 不需要改核心代码**」：

```ts
type ToolHandler<P> = (input: P, ctx: ToolContext) => Promise<R>;

interface Tool<P, R> {
  name: string; // 唯一
  description: string;                                // ←02 条详讲：决定模型何时调
  input: ZodSchema;                                    // ← Zod 校验（04 条单一来源）
  handler: ToolHandler<P, R>;                         // 实际执行（含 Gateway 钩子位）
  // 可选：dangerous?: boolean; idempotent?: boolean;
}

const registry = new Map<string, Tool<any, any>>();
export function register<P, R>(tool: Tool<P, R>) {
  if (registry.has(tool.name)) throw new Error(`Tool ${tool.name} 已注册`);
  registry.set(tool.name, tool);
}
```

### 真实例子 · 差旅助手（5 轮混合）

```text
User: "我下周去东京 5 天，预算 1.5 万人民币，帮我出份行程单"
  │
  ▼ Round 1（并行 3 个 tool_call）
  trip_weather(东京) → { city: "东京", temp_c: 22, condition: "晴" }
  trip_exchange(CNY, JPY) → { base: "CNY", target: "JPY", rate: 21.0 }
  trip_attractions(东京, top_n: 3) → { items: [浅草寺, 东京塔, 上野公园] }
  │
  ▼ Round 2（串行 1 个，等 R1 的汇率换算预算）
  trip_hotels(东京, nights: 5, per_night_cny_budget: 15000/21/5 ≈ 143)
  → 给出三档酒店 + total_cny
  │
  ▼ Round 3 / R4（串行 1 个，继续依赖）
  trip_flights(北京, 东京, "2026-09-10") → 3 个航班选项
  │
  ▼ Round 5（stop）
  model.content = "你的行程单：
    Day1: 抵达东京，入住商务酒店..."
```

→ 整个 5 轮 = 1 次并行 + 3 次串行依赖 + 1 次终态。**不是循环出错，是业务有依赖**。

---

## 取舍

| 场景 | 推荐 | 何时反向 |
| --- | --- | --- |
| 1 个用户问题可拆成 2 个独立查询 | **并行**（Promise.all） | 查询间有数据依赖 → 串行 |
| 业务要求"必须先鉴权再查 DB" | 串行：Round 1 鉴权 → Round 2 查 DB | 鉴权查 DB 可并发 → 并行（少见） |
| 想让模型可以拒调工具 | 协议 A 不设 `tool_choice`（默认 none）；协议 B `tool_choice: { type: "any" }` | 想强制调 → `tool_choice: { type: "function/tool", name }` |
| 想强制调某个工具 | 协议 A `tool_choice: { type: "function", function: { name } }`；协议 B `tool_choice: { type: "tool", name }` | 让模型自决 → 不传 `tool_choice` |
| 跨协议兼容 | 同一份 Zod → 派生协议 A `parameters` + 协议 B `input_schema` | 04 条已沉淀的"一份契约两端用" |

---

## 踩坑（本 demo 实证数据 · 千问 qwen3.8-max 实跑）

| # | 踩坑 | 修法 |
| --- | --- | --- |
| 1 | **全串行执行并行 tool_calls** —— 体感多 5–10 秒延迟 | `Promise.all(tool_calls.map(executeOne))` —— 看 call 间是否有输入消费 |
| 2 | **handler throw 没 catch → 整个 koa 接口 500** | catch 块把错误包成 `tool_result`（含 `is_error: true`）回传模型——**让模型自己决定**下一步（重试 / 换路径 / 报告用户） |
| 3 | **`finish_reason="tool_calls"` 当 stop 截断** | 终止条件决策表：只有 `stop` / `end_turn` 才终止；其它都循环 |
| 4 | **tool_result 原样 echo 给用户** | UI 只显示 `message.content`（最终答案）；tool_result 是中间过程 |
| 5 | **协议 A `arguments` 是字符串，要 JSON.parse** | `JSON.parse(tc.function.arguments)`——`tc.function` 必带 `.name` 和 `.arguments` |
| 6 | **协议 B `tool_use.input` 是对象，**不要** parse** | 直接用 `block.input`——`JSON.parse({...})` 会抛错 |
| 7 | **协议 B `max_tokens` 必填** | 忘填直接 400；Anthropic SDK 不会默认帮你填 |
| 8 | **协议 B `content` 是数组** | `for (const b of res.content) { if (b.type === "tool_use") {...} }` —— 直接 `res.text` 不存在 |
| 9 | **协议 B filter 后忘了并行** | `Promise.all(toolUses.map(executeOne))` —— 别串行 |
| 10 | **协议 B 回灌时整段 `content` 数组作 assistant + 一条 user 数组** | 不要拆开；保留 text + tool_use 顺序 |
| 11 | **Zod 校验失败没回灌** | `safeParse` 失败时，把 `path.join(' + message)` 拼成 `tool_result` 回传——**这是 04 条沉淀的 repair 闭环** |
| 12 | **Registry 里 name 重复** | `register()` 时检查 `registry.has(name)` → throw——本 demo `defineTool` 内已加 |
| 13 | **handler 抛错后**没**让模型重试或换路径** | 把错误信息当 tool_result 回传 → 模型决定；本 demo ⑤ 实测模型**主动重试**了一次再 stop（千问行为） |
| 14 | **模型把数字字段填字符串** —— 拿 `{"top_n": "3"}` 喂 Zod `z.number()` 直接 ✗ | `z.coerce.number().int().min(1).max(10).default(3)` —— `coerce` 内部 `Number(v)` 把字符串转数字；**这是真实的工程妥协**（模型偶尔会给 `"3"`），把它当教学点比"假装不会发生"更值 |

---

## 我追问过的

- **「能画这一圈，含并行调用」** → 给出 Round 1 → Round 2 → 终止完整图；并行 vs 串行判断法（看 call 间是否有数据依赖）
- **「协议 B 三连坑」** → (a) `content` 是数组不是对象 / (b) filter 后并行 / (c) 回灌时整段数组作 assistant + 一条 user 数组
- **「错误回传 ≠ 抛异常终止」** → 强调 handler `throw` 不挂循环，包成 `tool_result`（含 `is_error: true`）回灌；本 demo ⑤ 实测模型主动重试
- **「为什么 `Promise.all` 重要」** → 模型一次返回多个 tool_call 没数据依赖 → 必须并行；全 `for await` 串行延迟翻倍
- **「tool_result 是给谁看的」** → 给模型，不是给用户；UI 只显示 `message.content`
- **「串行 / 并行在 demo 里到底怎么看」** → 答在「完整一圈」：Round 1 多 tool_call = 并行；Round 数 > 1 = 串行依赖；看 RoundCard 标题的「· N 个 tool_call」徽标
- **「Demo 再详细点，流程再多轮，举一个真实例子」** → 答在「⑥ 真实业务流 · 差旅助手」：5 轮混合 = R1 并行 3 个 + R2-R4 串行各 1 个 + R5 stop
- **「trip_attractions 反复报 Zod 错」** → 模型把 `top_n` 填成字符串 `"3"`；修法 `z.coerce.number()`——见踩坑 #14

---

## §5.2 Demo 判断块

```text
Demo 判断
- 小节：Function Calling 协议
- 结论：可运行 §5.3（HTTP Demo · 仅协议 A）
  · 落点：apps/05-Tool-Calling/01-Function-Calling-协议/
  · 端口 50501（5{模块两位}{小节两位}）
  · 脚本 app:05-01-function-calling-protocol（沿用真实小节号 + 英文）
- 包含 9 个 Tool（旧 4 + 新 5 个 trip_*，对应 ⑥ 差旅助手）：
  · add：{ a: number, b: number } → { sum }
  · get_weather：{ city: string.min(1) } → { city, temp_c, condition }
  · lookup_user：{ user_id: string.regex(/^u\d+$/) } → { id, name, level, points }
    u999 故意 throw "数据库连接超时" → 演示工具执行失败回传
  · search_wiki：{ query: string.min(2) } → { title, summary }
  · trip_weather：{ city } → { city, temp_c, condition }（mock 东京/北京 两条）
  · trip_exchange：{ base, target } → { base, target, rate }（mock CNY/JPY=21.0 等四对）
  · trip_attractions：{ city, top_n } → { city, items }（top_n 用 z.coerce.number 接受字符串/数字，见踩坑 #14）
  · trip_flights：{ from_city, to_city, date(YYYY-MM-DD) } → 3 个航班选项
  · trip_hotels：{ city, nights, per_night_cny_budget } → 3 档酒店 + total_cny + fits_budget 标记
- 包含 4 个主端点 + 2 个辅助端点：
  · POST /api/run                  完整 Round 1 → Round 2 → 终止（单/并行自动适配）
  · POST /api/run-serial           串行多轮（最多 5 轮，用 Round 2 拿到的 level 调 add）
  · POST /api/run-realistic        差旅助手 4-5 轮混合业务流（trip_* 5 个工具，maxRounds=5）
  · POST /api/simulate-zod-error   服务端绕过模型篡改 arguments → Zod ✗ → repair → Zod ✓
  · GET  /health                   环境信息 + 注册表 tool 列表
  · GET  /tools                    Registry 全貌（name + description + JSON Schema · Zod 派生）
- 理由：5 用例覆盖完整一圈（①②③）+ 错误处理 ≥2 类（④ Zod 校验失败 + ⑤ 工具执行失败）+ ⑥ 4-5 轮混合业务流（演示并行/串行在真实场景下自然混合）
- 错误传播：writeUpstreamError(ctx, err) helper，透传上游 HTTP 状态码 + upstreamStatus 字段（沿用 04 条踩坑 #15）
- DeepSeek 兼容：N/A（本条只走协议 A 且未用到 strict / json_object 关键字；按需加 system "JSON" 关键字）
- yarn typecheck：✅ 通过
- 浏览器验证：
  · ① 单 tool 调用（北京天气）·千问 qwen3.8-max 实跑：Round 1 tool_calls.length=1 → get_weather("北京") → Zod ✓ → 执行 ✓ → Round 2 stop。终态："北京今天天气是**晴**，气温 **25°C**"（4236ms）
  · ② 并行 tool 调用（北京天气 + 100+200）·千问 qwen3.8-max：Round 1 tool_calls.length=2 → get_weather + add 并行执行 → Round 2 stop。终态："晴25°C / 100+200=300"（5159ms）
  · ③ 串行数据依赖（查 u001 → level+7）·千问 qwen3.8-max：Round 1 lookup_user → {level:3} → Round 2 add(3,7) → {sum:10} → Round 3 stop。"结果是 **10**"（7196ms）
  · ④ Zod 校验失败 + repair ·千问 qwen3.8-max：服务端篡改 a="not_a_number" → Zod ✗ "Expected number, received string" → Round 2 模型修复成 {a:5,b:3} → Round 3 真执行 → Round 4 stop。"5 + 3 = **8** 🎉"（7215ms · 全程 Zod ✗ → repair → Zod ✓ 闭环可见）
  · ⑤ 工具执行失败（查 u999）·千问 qwen3.8-max：Round 1 lookup_user → throw → 执行失败 → 模型收到错误决定重试 → Round 2 再失败 → Round 3 stop。"两次尝试都失败，系统返回数据库连接超时"（8005ms · 演示 handler throw 不挂循环 + 模型主动重试智能行为）
  · ⑥ 差旅助手 4-5 轮混合 ·MiniMax-M3 实跑：Round 1 并行 3 个 tool_call（trip_weather + trip_exchange + trip_attractions）→ Round 2/3/4 串行各 1 个（依赖 R1 的汇率/前置项）→ Round 5 finish_reason=stop → 行程单。"5 轮 · 23499ms"。模型完整经历了「并行 → 串行 → 串行 → 串行 → stop」4 步依赖链
- 与 start 预告：一致
```

---

## 过关自检

> 目标：「能画出这一圈，含并行调用」+ 围绕 README 验收 9 条 + 自测问题。

1. **手画 Round 1 → Round 2 → 终止** 三段：标出每段谁在跑（模型 / 客户端）、传什么字段（`tool_calls` / `tool_result` / `message.content`）、什么时候循环什么时候停。
2. **给出 3 个 tool_call 互相不依赖的场景**，写出 `Promise.all` 提取代码（协议 A 直接遍历、协议 B 先 `filter` 再 map）。
3. **写一段 Zod 校验失败的 tool_call** 怎么回传——`is_error: true` 还是不带？看协议 A/B 的字段差异。
4. **协议 B 三连坑**：(a) `content` 是数组不是对象、(b) filter 后并行、(c) 回灌时整段数组作 assistant + 一条 user 数组传 tool_result——能口述。
5. **错答**：把 `finish_reason="tool_calls"` 当 stop 截断会发生什么？把 tool_result 原样 echo 给用户会发生什么？把模型请求当成"已执行成功"上报会发生什么？
6. **handler throw 没 catch**：整个调用链怎么挂？正确做法是 catch → 包成 `tool_result`（含 `is_error: true`）→ 让模型决定重试 / 换路径 / 报告用户。
7. **自测问题（README）**：「Tool Call 完整数据流是什么？」——口述三段；「为什么"模型请求了"还不能直接执行？」——口述"请求 ≠ 执行 + Gateway 钩子位"。
8. **差旅助手 5 轮混合**：点 `/pages/realistic.html` 跑"东京 5 天"，数 totalRounds = 5（串了 4 次依赖）、数 R1 的「· 3 个 tool_call」（并了 3 件事）、看 R5 的 `finish_reason=stop`（绿徽标）。能口述「为什么这么多轮 = 业务有先查后算的依赖」。

---

## 还没搞懂的

| 还没搞懂的 | 去哪解决 |
| --- | --- |
| **Tool Gateway 鉴权 / 配额 / 危险操作拦截** | 本模块 [04-Tool-Gateway-幂等](./04-Tool-Gateway-幂等.md)（Gateway 钩子位在 `tool.handler(parsed.data, { toolCallId })` 里实现）；模块 20 AI Security（卡片：Tool 权限模型） |
| **幂等 Tool 设计**（同一参数执行两次业务结果一样） | 本模块 04（Tool Gateway 幂等）—— 涉及 idempotency_key / 业务副作用判断 |
| **OAuth 用户委托授权**（Agent 调第三方 API 用用户 OAuth，不用上帝 Key） | 模块 20 AI Security（用户授权 / 凭证管理）—— 概念即可，不必接真 OAuth |
| **协议 B3 模型拒调工具 + tool_choice 强制** | 04 条已沉淀的 B3 实测；本条落代码时如碰到拒调分支，按 04 条 §B3 软约束处理 |
| **协议 A `parallel_tool_calls` 默认行为** | OpenAI 官方文档——gpt-4o 起默认开启 `parallel_tool_calls=true`；如要禁用显式 `parallel_tool_calls: false` |
| **Tool Description 写得好不好对守约率的影响** | 本模块 [02-Tool-Description](./02-Tool-Description.md) —— 决定模型"何时调 / 调哪个 / 参数怎么填" |
| **Tool Choice 三档（auto / none / required）使用场景** | 本模块 [03-Tool-Choice](./03-Tool-Choice.md) —— 强制调 vs 让模型自决 vs 不让调 |

---

## 与 04 条沉淀的桥梁

- 本条 Tool 的 Zod schema 与 04 条的 `IntentZod` 是同一份"Zod 单一事实来源"原则的延伸——同一份 Zod → `safeParse` 验证 + JSON Schema 派生喂模型。
- 04 条沉淀的「`ZodError.issues[].path + message` 当 tool_result 回传」是本条 Zod 修复闭环（用例 ④）的核心机制。
- 04 条沉淀的「协议 B 没有 `response_format`，闸分散在 `tools[].input_schema` + `tool_choice`」是本条协议 B 形态差异的源头——`tools` 是协议 B 的"闸的容器"，不是一个开关。

## 与 start 预告的一致性

- 预告说"含并行调用"——本条 §并行调用 + §易混点 已落实。
- 预告说"Zod 参数校验失败回传模型（repair）"——本条 §机制 + §踩坑 #11 + 用例 ④ 已落实。
- 预告说"一个 Tool 故意触发错误看错误态"——本条 §踩坑 #2 + #13 + 用例 ⑤ 已落实。
- 预告说"Gateway / 幂等 / OAuth 留 03/04 条展开"——本条 §还没搞懂的 已指路。