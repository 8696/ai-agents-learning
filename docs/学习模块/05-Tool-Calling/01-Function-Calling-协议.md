# **Function Calling 协议**：model → tool_call → execute → tool_result → model

> 对应模块：[模块 05 · Tool Calling / Function Calling ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 1 条

- **来源**：本对话（`coach start` 详解 §6.2 + 落 step-1 锁定 + step-2 真 LLM）+ 2026-09-04 重新讲解一轮（补「需求清单」独立节 + 「例子 4」点名 §5.4.A2 + step-3 落 + 1:1 规则 + 并行/串行选型与依赖写法）+ MiniMax-M3 实测响应（[apps/05-Tool-Calling/01-Function-Calling-协议-step-2](../../apps/05-Tool-Calling/01-Function-Calling-协议-step-2/README.md)）
- **状态**：已沉淀 · 2026-09-03 · 2026-09-04 step-3 落（修 §5.4.A2）+ §5.4 闸门重跑过
- **Demo**：已落 `apps/05-Tool-Calling/01-Function-Calling-协议-step-1/`（✅ 锁定 · mock 不调 LLM）+ `…-step-2/`（✅ 锁定 · 真 LLM 协议 A · 请求/响应可视化）+ **`…-step-3/`（🔄 打磨中 · mock 3 async Tool + Promise.all + gantt 时序图 + 串/并行对比按钮 · check-demo 过 · §5.4 重跑过 · 待学习者锁定）** —— 详见 [§Demo 子节进度](#demo-子节进度)

> 各节写什么、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

## 是什么

Function Calling（Anthropic 叫 Tool Use，智谱同字段）是 LLM 和外部世界的**对话级握手协议**——它让模型在生成答案的中途**开口说**"我需要调哪个工具、参数是什么"，由你的代码去执行，再把结果**塞回对话历史**，让模型继续生成。

完整一圈是五个动作，每个动作都是真实存在的：

```
model          (用户问："北京今天多少度？")
  ↓
tool_call      (模型决定调 get_weather(city="北京"))
  ↓
execute        (你的代码真的去请求 OpenWeatherMap)
  ↓
tool_result    (把 {temp:25, sky:"晴"} 作为新消息塞回对话历史)
  ↓
model          (模型读到 tool_result → 输出 "北京今天 25 度，晴")
```

这条链**不止跑一次**——模型可以根据 `tool_result` 再决定调下一个工具（先查天气再决定要不要提醒带伞）。这是后面 ReAct / 多步 Agent 的物理基础。模型"循环"的能力，物理上靠的是"塞回 tool_result"这一步让 messages 历史变长，模型再读 → 再决定。

**对照 JSON Mode**：JSON Mode 只是"返回合法 JSON 字符串"，Function Calling 是"返回结构化 tool_call 以触发外部执行"。两者骨架不同。

## 为什么（Agent 开发要懂）

1. **Agent 能力的根。** 所有动手能力（查 DB、下单、写文件、发邮件、查天气）必须由模型**自己判断**何时调哪个；hard-code 调用的程序只能做"嘴炮"。Function Calling 把"判断"这一步下放给模型。
2. **协议 = 万能钥匙。** OpenAI / Anthropic / 智谱 / Ollama 各家 SDK 长不一样，**骨架一样**（工具 schema → 模型返回 tool_call → 你执行 → 结果塞回去）。学会一套，剩下都是字段命名差异。Anthropic 多了 `max_tokens` 必填、content blocks 结构；OpenAI 多 `tool` role；其余形状同构。
3. **天然的安全边界**。模型只"开口要"，**不**真的执行。这给了你做权限校验、限流、人工审核的中间层——「Tool Gateway / 幂等」那一刀会专门讲。
4. **后续概念的物理前置**。ReAct 循环、Memory、Workflow、多 Agent——都建立在"模型能在生成过程中穿插 tool_call"上。今天这一条没讲清，后面 07 手写 Agent 直接卡死。

### 选型准则（并行 vs 串行 · 主轴 = 依赖关系）

**核心判据不是「快 vs 慢」，是「它们之间有没有依赖」**。

```
B 需要 A 的输出吗？
├─ 否 → 能并行吗？
│   ├─ 限流 / 共享资源 → 串行（或加 backpressure）
│   ├─ 数量爆炸（>20 个）→ 分批 Promise.all
│   └─ 都没问题 → ✅ Promise.all
└─ 是 → 串行（await chain；把 A 结果传 B 参数）
```

**用并行的场景**（独立 IO）：

| 场景 | 为什么能并行 |
| --- | --- |
| 多源数据拉取（仪表盘） | 5 个 IO 互不依赖，谁先回都行 |
| 多模型对比 | 同一问题问 GPT-4 + Claude + Gemini，3 个独立 API |
| 独立搜索 | 多关键词、多知识库，合并去重 |
| 多航班/多商品查询 | 用户想看 3 个目的地的票价 |
| 本 Demo 旅游规划 | 机票 / 天气 / 打包清单 3 个独立查询 |

**用串行的场景**（有依赖 / 受限）：

| 场景 | 为什么串行 |
| --- | --- |
| 下游依赖上游结果 | `B` 需要 `A` 的输出当参数 |
| RAG 完整 pipeline | `embed → retrieve → rerank → generate` 每步依赖前一步 |
| 下单流程 | `get_user → check_inventory → reserve → payment → notify` |
| API 限流 / 配额 | 并发 100 个 = 触发 rate limit 被 ban |
| 共享资源争用 | 单连接 DB 串行查多张表 |
| 成本控制 | `A` 不返回 → `B` 没必要跑（节省 token） |

**最常见反模式**：看着「安全」把独立 IO 写成串行 → 浪费延迟 + 模型嫌慢 → 编造结果（详「踩坑」节）。

## 五个核心对象（逐个讲透）

### ① `tools`（你告诉模型"我能调什么"）

请求时附带一组**工具 schema**——每个工具包含 `name` / `description` / `parameters`（JSON Schema）。`description` 是**给模型看的 prompt**，不是给程序员看的注释；`parameters` 既是给模型的格式约束，也是给 SDK 的解析依据（Zod 校验就靠它）。**schema 写得糊，模型就糊**。OpenAI strict 模式（`json_schema` + `strict: true`）还会把 `additionalProperties: false` + `required: [...]` 当物理闸。

### ② `tool_call`（模型的"开口要"）

模型**不**直接返回"自然语言答案"，而是返回**结构化请求**——OpenAI 在 `choices[0].message.tool_calls[i].function`，Anthropic 在 `content[i].type == "tool_use"`。关键是：**这是"决定"，不是"执行"**。你拿到这个 tool_call 后，可以选择执行、拒绝、改参数、人工审核。模型没有执行外部代码的权限。

⚠️ **常见踩坑**：`tool_call[i].function.arguments` 是 **JSON 字符串**（`"{\"city\":\"北京\"}"`），不是对象。要 `JSON.parse()` 再喂给 handler。

### ③ `execute`（你的代码干实事）

```ts
const call = resp.tool_calls[0];
const args = JSON.parse(call.function.arguments);   // ① 解析
const ok = toolSchema.safeParse(args);              // ② Zod 校验
if (!ok.success) return errorToToolResult(ok.error); // 失败也回传，不抛
const result = await realApi(args);                 // ③ 真正副作用
```

这一步是**真实副作用**：扣钱、写库、发邮件。**Gateway**（权限 / 配额 / 危险操作）插在这一步前面。**并行**：模型一次返回多个 tool_call 时，必须 `Promise.all(calls.map(execute))` 并发；`for await` 串行 = 模型嫌慢，可能编造结果。

### ④ `tool_result`（结果塞回对话历史）

把执行结果（成功**或**失败的错误信息）作为**新消息**塞回：

```json
{
  "role": "tool",
  "tool_call_id": "call_abc123",   // 必须对得上 assistant 的 tool_calls[i].id
  "content": "{\"temp\":25, \"sky\":\"晴\"}"
}
```

**失败也要回传**——把 `数据库连接超时` 塞回去，模型能换一种方式重试。抛 500 给用户，模型就断片了，没法自纠。这是踩坑最常见的地方。

### ⑤ `model`（第二轮生成）

模型读到 `tool_result`，**结合整段对话历史**（包括自己上一轮的 tool_calls），重新生成自然语言答案。如果 `tool_result` 还没满足需求，模型可以**再**发一个 tool_call——循环就开始了。

如果 `choices[0].finish_reason === "tool_calls"` → 进下一轮；如果 `=== "stop"` → 终态，`choices[0].message.content` 就是 `final_reply`。

## 易混点

| 对比 | 真相 | 判错代价 |
| --- | --- | --- |
| **Function Calling ≠ JSON Mode** | JSON Mode 只保 `JSON.parse` 不抛；FC 多保"结构化 tool_call + 触发外部执行" | 用 JSON Mode 写 Agent → 拿到字符串还得自己解析 + 触发执行，绕一圈 |
| **模型"决定调" ≠ "已执行"** | 模型只"开口"，不执行 | 把 `await fetch(...)` 直接接在 tool_call 上 → 任何 prompt 注入都能调你的真接口；**Gateway 必须**（05-04 那一刀讲） |
| **并行 vs 串行 ≠ 快 vs 慢** | 主轴是「依赖关系」：B 需不需要 A 的输出？需要 = 串行；不需要 = 并行 | 把独立 IO 写成串行浪费延迟 + 模型嫌慢编造结果；把依赖链放进 Promise.all 拿 undefined 当参数 |
| **OpenAI vs Anthropic 协议 A vs B** | 字段命名不同，骨架同构（见下表） | 学了一个 SDK 以为另一个不会 → 其实换字段名就一样 |
| **并行调用 ≠ SDK 自动** | SDK 只把 `tool_calls[]` 列表交给你，**你**负责并行执行 | 默认 `for (const c of tool_calls) await execute(c)` → 串行 5 秒，模型嫌你慢，可能编造结果 |
| **tool_result 只回传成功** | 失败也要回传 | 抛异常 → 模型断片、用户看到 500 |

**协议 A vs 协议 B 字段对照（同一圈，两套写法）：**

| 概念 | OpenAI（协议 A） | Anthropic（协议 B） |
| --- | --- | --- |
| 工具定义 | `tools: [...]` | `tools: [...]` |
| 模型"决定调" | `choices[0].message.tool_calls[i].function` | `content[i].type === "tool_use"` |
| 回传结果消息 | `role: "tool"` | `role: "user"`，`content[i].type === "tool_result"` |
| 必填字段 | 无 | `max_tokens`（忘填直接 400） |
| 强制调用 | `tool_choice: "required"` | `tool_choice: {"type":"any"}` |
| 强制调指定 | `tool_choice: {type:"function", function:{name}}` | `tool_choice: {"type":"tool", "name":"..."}` |

数据怎么走？都一样：模型给"决定" → 你执行 → 结果塞回去。**记骨架，不记字段名**。

### 例子 5 · 前端：**串行依赖**调用（RAG 风格 · search_doc → summarize）

> 对比例子 4：例子 4 是「并行独立」；例子 5 是「串行依赖」。一个 Query 拆出 2 个 tool_call，但**第二个 tool_call 需要第一个的结果当参数**——这种不能并行。

- 用户：「总结 2026 年 AI Agent 领域的最新进展」
- 模型 Round 1 返回 1 个 tool_call：
  - `search_doc(query="2026 AI Agent 最新进展")` ← 独立 IO，先跑
- 后端执行 → 拿 `[{title, snippet}, ...]`
- 模型**再发** Round 2 tool_call（注意是「再发」，不是 Round 2 的 final）：
  - `summarize(content=search_results, style="技术综述")` ← 依赖 search_doc 的输出
- 后端 `await summarize(search_results)` → final_reply
- 模型合成自然语言总结

**代码长这样**（串行链，**不是** Promise.all）：

```ts
// ❌ 错：B 需要 A 的结果，但放进 Promise.all 让 B 拿 undefined
const [a, b] = await Promise.all([
  searchDoc({ query }),
  summarize({ content: undefined }),  // ← bug
]);

// ✅ 对：A 跑完拿数据，B 串行拿 A 的输出当参数
const searchResults = await searchDoc({ query });          // ① 第一步
const summary = await summarize({ content: searchResults, style });  // ② 第二步（用 ① 的结果）
// 模型最终根据 summary 输出自然语言
```

**关键观察**：「串行」不等于「慢」——是「有数据依赖」。模型**自己**会判断要不要把 `search_doc` 的结果传给 `summarize`（`description` 写好触发条件 + 参数说明是关键，详 02 Tool Description）。

**点名**：这是后面 08 RAG 基础与 11 Workflow 的物理前置。例子 5 与例子 4 形成「依赖 vs 独立」的完整对照——同一份协议骨架，两种编排方式。

**点名**：例子 4 / 5 都点名了 §5.4.A1「能画出完整一圈」；例子 5 多带出一层——**链式调用**让 messages 历史变长（`assistant(tool_calls) + tool` × N 轮），模型 Round-2 / Round-3 仍按「finish_reason === "tool_calls" → 再来一轮」的判定继续，直到 `finish_reason === "stop"` 才终态。

### 例子 5.5 · **模型自己编排链**（while + finish_reason 循环）

> 例子 5 是路由层 hard-code 链 A → B；真实 Agent 里**模型自己**决定要不要继续调下一个（基于 tool_result 内容）。两种编排**不互斥**：路由层给模型机会多轮调，但具体哪几轮、参数是什么、什么时候停，由模型决定。

```ts
// 真实场景的 while 循环（骨架，详 step-2 routes/chat.ts 单轮版）
async function chatWithTools(userInput: string) {
  const messages: ChatMsg[] = [{ role: "user", content: userInput }];
  let rounds = 0;
  const MAX_ROUNDS = 8;  // 防止失控

  while (rounds < MAX_ROUNDS) {
    rounds++;
    const resp = await llm.chat.completions.create({ model, messages, tools, tool_choice: "auto" });
    const assistantMsg = resp.choices[0].message;
    const toolCalls = assistantMsg.tool_calls ?? [];

    // ── 终止条件 1：模型决定"不用工具，直接答"──
    if (toolCalls.length === 0) return assistantMsg.content;

    // ── 推进历史：assistant(tool_calls) ──
    messages.push(assistantMsg);

    // ── 执行（这一轮 tool_calls 内部可并行 / 串行，看依赖关系）──
    const results = await Promise.all(toolCalls.map(c => executeTool(c)));
    // ── 回灌：tool × N ──
    messages.push(...results.map(r => ({
      role: "tool", tool_call_id: r.tool_call_id, content: JSON.stringify(r.ok ? r.result : { error: r.error }),
    })));
    // 下一轮模型看到 tool_result → 自己决定是 final 还是接着调
  }
  throw new Error("超过 MAX_ROUNDS 未收敛");
}
```

**关键观察**：
- `while + finish_reason === "tool_calls"` 是循环骨架，**代码不写死**链顺序
- `MAX_ROUNDS = 8` 是必要的 stop 条件（防止模型无限调）
- 每一轮内部 `Promise.all` 还是 `for await` **由本轮 tool_calls 的依赖关系决定**（回到选型准则）
- `tool_result` 失败也要回灌（`{error}`），让模型能换方案自纠，而不是抛崩

### 三种编排方式对比

| 方式 | 谁决定链顺序 | 代码骨架 | 适合 |
| --- | --- | --- | --- |
| **代码硬编码串行** | 路由层 | `await A; await B(A.result)`（例子 5） | 业务固定 pipeline（RAG / 下单） |
| **模型自由编排** | 模型 | `while + finish_reason === "tool_calls"` 循环 + `tool_choice: "auto"`（例子 5.5） | 探索式 Agent、研究类、用户意图开放 |
| **混合** | 模型决定要不要进；进哪个由路由层 hard-code | 例：路由层允许调工具，但 tool 列表只暴露"业务固定的两步" | 业务固定但允许跳过（典型：客服对话决定要不要先查订单再答） |

**链路深度 vs 成本**（在 while 循环里尤其重要）：

- context 越长（messages 加 N 轮 `assistant(tool_calls) + tool`）
- 单轮响应越慢（每轮 LLM 都要重读整段历史）
- token 消耗越大（每轮的 prompt 都包含历史）

**生产里的降本做法**（本条不展开，列给后面模块）：
- context 太长 → 用摘要压缩（模块 10 Memory）
- LLM 推理慢 → 切小模型 / 加缓存（模块 19 可靠性 / 成本 / 性能）
- 链深 → 加 checkpoint + HITL（模块 11 Agent State / Workflow）

## 例子（5 个，覆盖每个核心对象 + 串行依赖对照）

### 例子 1 · 生活：点餐机器人（覆盖 ②③④⑤）
- 用户：「一杯拿铁，中杯，少冰」
- 模型 `tool_call`：`create_order(item="latte", size="M", ice="less")`
- 订单系统真的写入订单库 → 返回 `{order_id: 12345, eta_min: 5}`
- 模型回复「下单成功啦！订单 12345，预计 5 分钟～」

### 例子 2 · 生活：智能家居助理（覆盖 ②③⑤）
- 用户：「客厅太亮了」
- 模型：` `set_light(room="living_room", brightness=40)`
- HomeAssistant 调暗灯 → `{ok:true}`
- 模型：「已经把客厅调到 40%，舒服点了吗？」

### 例子 3 · 前端：天气查询 chatbox（覆盖 ①②④⑤ + 协议层物理形态）
- 浏览器 chatbox 用户输入"深圳明天会下雨吗"
- 前端 POST `/api/chat` → 后端带 `tools` schema 调 `openai.chat.completions.create({model, messages, tools, tool_choice:"auto"})`
- Round 1 Response：`choices[0].finish_reason = "tool_calls"`，`message.tool_calls = [{name:"get_weather", arguments:'{"city":"深圳","date":"tomorrow"}'}]` ← **arguments 是 JSON 字符串**
- 后端 fetch OpenWeatherMap → tool_result `{rain_prob:0.8}`（这一步是 execute，穿过 Gateway + Zod）
- Round 2 Request：messages 多了 `assistant(tool_calls) + tool(tool_call_id, content)` 两条
- Round 2 Response：`choices[0].message.content = "深圳明天大概率下雨，记得带伞"` ← final_reply
- 前端把这串字流式渲染给用户

**完整例子见 [step-2 demo · #llm-protocol 4 张卡](../../apps/05-Tool-Calling/01-Function-Calling-协议-step-2/README.md)**——每张卡把同一条数据的 Request / Response JSON 摆出来，"协议层长什么样"能看见。

### 例子 4 · 前端：**并行**调用（旅游规划助手）—— 演示「本条要能讲清」的"含并行"
- 用户：「5 月去东京 7 天要带什么、机票多少钱？」
- 模型**一次响应**返回 3 个 tool_call：
  - `search_flight(to="东京", month=5)`
  - `get_weather(city="东京", month=5)`
  - `get_packing_list(season="spring")`
- 后端 `Promise.all([flight, weather, packing])` **并行**执行（**不是** `for await` 串行）
- 3 个 tool_result 一起塞回（一次回传三条）
- 模型合成"机票约 ¥3500、5 月平均 22°C 需带薄外套和雨伞、冲锋衣不必要"

**关键观察**：模型一次返回多个 tool_call 是合法且常见的；你的 `Promise.all` 是**必须的**——串行 `for await` 让模型不耐烦，甚至在长延迟下编造结果。这条单独点名，是因为「本条要能讲清」列了"含并行调用"。

**点名**：本条就是 [§5.4 闸门](#54-目标--代码整合闸门) 的 **A2 阻塞点**（step-1/2 全是同步 `.map`，无真实 `Promise.all` 证据）。需求清单见下一节。

## 需求清单（业务需求 · §6.2 item 6 + §6.3 变体覆盖硬性要求）

每核心对象 ≥1 条贴近业务的需求（**验收准绳，不是 step 生产的驱动器**——step 生产仍按本节知识动态推进 [§5.3.14](agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)；`coach complete` 勾 ✅ 时按需求**逐条对**）。

**本条核心概念「编排方式」的 5 个变体**（按 §6.3 自查触发器列全）：

| 变体 | 需求 | 对应 step-N |
| --- | --- | --- |
| ① 并行（独立 IO） | 需求 1 | step-3 |
| ② 串行 vs 并行对比 | 需求 2 | step-3 |
| ③ 串行依赖（A → B · B 用 A 输出） | 需求 3 | step-4 |
| ④ 模型自编排（while + finish_reason） | 需求 4 | step-5 |
| ⑤ 自纠 + MAX_ROUNDS 边界 | 需求 5 | step-5 |

> **2026-09-04 维护前**：「需求清单」只列了 ①② 两项 → 当成「本条所有需求」→漏掉 ③④⑤ 三个变体 → 学习者主动追问「模型自编排链这个说了吗」才发现。**现在按 §6.3 规则补齐为 5 条**，每条对应一个变体。

### 需求 1（主）· 旅游规划助手 · 演示「含并行调用」

- **业务场景**：用户在 chatbox 问"5 月去东京 7 天要带什么、机票多少钱"
- **目标**：让"并行调用"这一刀变成**可观察行为**
- **涉及本节知识点**：并行 tool_call · `Promise.all` 并发 · 多 tool_result 一次回传
- **验收标准**：
  - 模型**一次响应**返回 3 个 tool_call（`search_flight` / `get_weather` / `get_packing_list`）
  - 后端 handler 改成 `async`（哪怕 `await sleep(50ms)` 模拟真实 IO）
  - `Promise.all(calls.map(execute))` 并发
  - 前端用时序图（甘特图式横条）把"三个同时起步、独立完成"画出来
  - **串/并行对比按钮**：同输入两次执行，记录总耗时 + 模型回复质量

### 需求 2（次）· 串行 vs 并行 · 让"模型嫌慢编造结果"具象化

- **业务场景**：同一问题（"5 月东京 7 天规划"），串行 `for await` vs 并行 `Promise.all` 两次跑
- **目标**：把踩坑"串行 → 模型不耐烦 → 编造结果"从口诀变证据
- **涉及本节知识点**：执行顺序对模型行为的影响（不是单纯速度问题）
- **验收标准**：同输入两按钮，对比总耗时（串行 ≈ N×单 tool 耗时；并行 ≈ max 单 tool 耗时）+ 模型最终回复是否编造（编造 = 出现不在 tool_result 里的数字）

### 需求 3 · 串行依赖 · search_doc → summarize（B 用 A 输出）

- **业务场景**：用户在 chatbox 让"总结最近 AI Agent 进展"——需要先搜文档，再对搜索结果做摘要
- **目标**：让"链式依赖"这一刀变成**可观察行为**——B 必须等 A 完成才能拿到 `content` 参数
- **涉及本节知识点**：依赖链 `await A; await B(A.result)` · Promise.all **不能**用于此场景（会拿 undefined）
- **验收标准**：
  - search_doc 返回 hits 后
  - summarize 的 `content` 参数**等于** search_doc 的 `result`（**不是**用户原始 query）
  - 两步 gantt 时序图显示 bar 顺序堆叠（左累加），总长 ≈ 130ms（80+50）
  - 错误反例演示：把 summarize 放进 Promise.all 与 search_doc 并发 → `content: undefined` → 显式标注 ❌

### 需求 4 · 模型自编排 · while + finish_reason 多轮链

- **业务场景**：用户在 chatbox 让"自动规划 + 总结"—— 模型**自己**决定要搜几次、要不要扩 query、什么时候停
- **目标**：把"模型自己编排链"这一刀变成**可观察行为**——while 循环 + 每轮由模型决定
- **涉及本节知识点**：`while (rounds < MAX_ROUNDS)` 循环 · `decideNextAction` 模拟 LLM 决策 · 推进历史（`messages.push(assistant(tool_calls))` + `messages.push(...tool)`）·终止条件 1 = kind === "final" / 终止条件 2 = MAX_ROUNDS 触发
- **验收标准**：
  - 真实 while 循环骨架（不是 hard-code 几步）
  - query 长 → 2 轮收敛（搜 → 总结）
  - MAX_ROUNDS 边界：超 N 轮未收敛 → 业务降级（structured error 返给上层）
  - 选型三档对照：硬编码串行 / 模型自由 / 混合（混合是模块 13 框架的活）

### 需求 5 · 自纠 + 边界 · 空 tool_result → 换 query 重试

- **业务场景**：用户搜得太模糊（query 太短）→ search_doc 返空 hits → **不能崩** → 模型扩 query 重试
- **目标**：把"模型自纠"这一刀变成**可观察行为**——tool_result 不满意 → 模型换参数再调
- **涉及本节知识点**：tool_result 回灌（详 §5.3.16 + 例子 5.5 `messages.push(...tool)`）· 模型根据 result 内容决策 · 重试参数可与上次不同
- **验收标准**：
  - search_doc(query 短) → 空 hits → 模型扩 query 重试 → 拿到 hits → summarize
  - 故意触发失败模式（如含 ❌ 标记或极端参数）→ 多次自纠仍失败 → MAX_ROUNDS 触发 → 业务降级（structured error）
  - 重试**参数与上次不同**（不是机械重试），演示"模型看 tool_result 调整方案"

**禁止**（[§6.2 item 6](agents/06-teach.md)）：
- hello-world（"调 1 个加法 Tool"）—— 不覆盖并行
- 单函数 mock —— 教学点被淹没
- "提到了 Promise.all" —— §5.4.A2 明确：必须是**真实异步** + 时序图 + 可观察耗时

## 取舍 / 踩坑

| 坑 | 后果 | 怎么做 |
| --- | --- | --- |
| `description` 写成"查询天气" | 模型不知道何时该调 vs 让用户自己说 | 写明触发条件 + 必要参数；写糊 = 模型不调或乱调 |
| 一次注册 20 个工具 | 模型选择困难，调错工具概率陡增 | 分批 / 按场景分组 / 第一个版本 ≤5 个 |
| `tool_result` 不截断塞回 | 查 DB 返回 10MB 日志 → 爆 context | 后端截到 ~2KB，或用摘要（Memory 模块会讲） |
| 失败抛异常不 tool_result | 模型断片、用户看到 500 | catch → 构造 `{ok:false, error:"timeout"}` 塞回去 |
| 串行 `for await` 执行多 tool_call | 慢 + 模型不耐烦 → 编造结果 | `Promise.all` |
| 独立 IO 写串行（看起来"安全"实际浪费） | 总耗时 = sum 而非 max；模型嫌慢 → 编造结果 | 看「选型准则」节：依赖关系是主轴 |
| 把 model 当 root user 直接 execute | 任何 prompt 注入 = 真接口被调 | 中间必过 **Gateway**（05-04 那一刀）；本条 Gateway 教学点落到 [step-1 demo](../../apps/05-Tool-Calling/01-Function-Calling-协议-step-1/README.md) 的"试危险工具 calc"按钮——`dangerous: true` 的工具被 Gateway 拦下，回灌 `{ok:false, error}` |
| OpenAI strict 模式不带 `additionalProperties:false` | API 直接 400，模型没法救 | 严格模式下 JSON Schema 必带 `additionalProperties:false` + `required:[...]` |
| `arguments` 当对象用（不是字符串） | `tool.name(args)` 报 "args is not a function" | **记住：`tool_calls[i].function.arguments` 是 JSON 字符串**，先 `JSON.parse` |

### 协议 A / 协议 B 选型（取舍）

| 情况 | 推荐 | 理由 |
| --- | --- | --- |
| 国内 MiniMax / 智谱 / DeepSeek | 协议 A（OpenAI Chat Completions） | 协议 A 是事实标准，国内网关基本都做了 OpenAI 兼容端点；Anthropic 兼容要单独配 base URL |
| 海外 Anthropic 直连 | 协议 B（Messages API） | Claude 直连 + 强制 `max_tokens` 字段；extended thinking 用协议 B 才有 |
| 同一 Demo 想并排对照 A vs B | 按 §5.3.13 拆两份 Demo | 一份塞两套 SDK = 代码长满 `if (protocol === "b")` 分叉，教学点被淹没 |
| 国内 reasoning 模型 + 协议 B 强制 tool_choice | 多 **不**可行 | reasoning 模型在 thinking 路径下 B3 强制 tool_choice 会被 HTTP 400；只能切非 reasoning 模型 |

## 过关自检

| 自检问 | 答在哪 |
| --- | --- |
| 能用一句话说出 Function Calling 协议是什么？ | 「是什么」节首段 |
| 能画出完整一圈（5 个动作）？ | 「是什么」节 + 例子 1 |
| `tool_call.arguments` 是对象还是字符串？ | 核心对象 ② + 踩坑末条 |
| 模型"决定调"完就能直接执行吗？ | 为什么 §3 + 易混点"决定 ≠ 执行" |
| 并行 vs 串行怎么选？主轴是什么？ | 选型准则节（主轴 = 依赖关系）+ 易混点"并行 vs 串行 ≠ 快 vs 慢" |
| 并行调多个 tool_call 时怎么写？ | 核心对象 ③ + 例子 4 + 踩坑"串行 for await" |
| 串行依赖怎么写？（B 需要 A 的结果） | 例子 5（RAG 风格）+ 代码块对比 |
| OpenAI vs Anthropic 怎么选？字段差在哪？ | 易混点表"协议 A vs B" + 取舍 |
| tool_result 失败了怎么办？ | 核心对象 ④ + 易混点"tool_result 只回传成功" |
| 怎么给模型写工具描述？ | 核心对象 ① + 踩坑"description 写不好" |

## 还没搞懂的 → 去哪解决

| 还没搞懂的 | 去哪解决 |
| --- | --- |
| `tool_choice: "required"` / `{type:"function", function:{name}}` 强制调用 | **模块 05 · 03 · Tool Choice**（下一条，专门讲） |
| execute 前过权限 / 配额 / 危险操作校验 | **模块 05 · 04 · Tool Gateway / 幂等**（再下一条） |
| 用户委托授权（Agent 调 OAuth 用**用户**的 Key，不是上帝 Key） | **模块 20 · AI Security** |
| 流式响应（tool_call 流式 + content 流式分轨） | **模块 02 · LLM API 开发**（已学） + 协议 A 的 `stream: true` 选项 |
| 同 provider 协议 B 实装差异（DeepSeek / Zhipu / Kimi / Qwen 协议 B 是否守 input_schema） | **模块 19 · 可靠性 / 成本 / 性能** + 自己查 |
| 国内 reasoning 模型 + 协议 B tool_choice 冲突 | 协议 B 显式 `thinking: {type:"disabled"}`；自己查（provider 文档） |

## 我追问过的

| 问了 → 答在 |
| --- |
| 「落 demo 时怎么落？」 → 答在[agents/05-demo.md §5.3.14](../../agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新) + 本轮给的「落 Demo 流程」块 |
| 「进入 step-2，把模型加入进去，先写协议 A 的」 → 答在 step-2 README + #llm-protocol 4 卡 |
| 「调用模型的请求参数和响应参数原理是什么？前端看得到」 → 答在 [step-2 lib/llm/protocol-a.ts](../../apps/05-Tool-Calling/01-Function-Calling-协议-step-2/lib/llm/protocol-a.ts) 类型注释（每个字段"是什么 / 为什么"）+ 前端 #llm-protocol 把同一份注释的**物理形态**摆出来 |
| 「step-2 Gateway 拦截演示不出来怎么办？」 → 模型自己读 `description` 主动拒绝 dangerous tool；Gateway 是**第二道防线**（防 prompt injection），不是**第一道**（第一道是模型自律）。要强制演示需绕开模型直接喂 dangerous tool_call 给 Registry（step-3 候选） |
| 「重新讲解本条」 → 答在 2026-09-04 沉淀增量：「含并行调用」点名 §5.4.A2 阻塞 + 「需求清单」独立节（含 step-3 起步 spec：旅游规划助手 + 串/并行对比）+ §5.4.B 增量重跑新增业务需求行 |
| 「下一个 demo 应该包含什么功能比较合适，为什么」 → 答在 2026-09-04 沉淀增量：3 Tool（search_flight 80ms / get_weather 50ms / get_packing_list 30ms，全 async）+ Promise.all 真并发 + gantt 时序图 + 串/并行对比按钮（独立 mock 路线 = 修法 2） |
| 「为什么这里不是做成三个 html，我记得不是说要拆吗」 → 答在 agents/05-demo.md §5.3.8 「页与接口 1:1」规则（每个独立场景 = 单独 page + 单独 route 文件）+ step-3 重构为 public/index.html + public/pages/single.html + public/pages/compare.html + routes/plan.ts + routes/compare.ts |
| 「写到 agents 里面去，一个 demo 里面一个单独的功能也要用一个单独的页面。然后服务端的也是」 → 答在 2026-09-04 维护模式沉淀到 agents/05-demo.md §5.3.8「页与接口 1:1」规则；反例：单 `/api/plan` 用 mode 同时服务「跑单跑」+「对比」两个独立场景；正例：单跑 → routes/plan.ts / 对比 → routes/compare.ts（前者 mode 切换 parallel|serial 是同一场景 sub-variant，**不**触发拆分） |
| 「并行和串行的在代码中应用场景是什么？什么情况下使用哪种？」 → 答在本节「选型准则」节（主轴 = 依赖关系）+ 「例子 5 · 串行依赖」+ 「踩坑」节新增「独立 IO 写串行」反例 |
| 「先沉淀然后接着讲」 → 沉淀：增量更新「选型准则」节 + 「例子 5」+ 「踩坑：独立 IO 写串行」+ 「我追问过的」追加 4 条 + 选型准则 → 讲课：依赖链代码模式（单链 A → B · 模型自己编排 vs 路由层 hard-code · 三种编排方式对比 · 反例放进 Promise.all · 链路深度 vs 成本） |
| 「可以，加一个（chain）」 → 落 step-4 = copy 锁定的 step-3 + 替换 chain 场景：2 个 Tool（search_doc 80ms + summarize 50ms）+ await 链式 routes/chain.ts + pages/chain.html（query + style 三选一）+ gantt 链式时序 + final summary |
| 「模型自己编排链这个说了吗」 → 答：本轮先讲后沉：例子 5.5 已补 while + finish_reason === "tool_calls" 骨架代码块 + 三种编排方式对比表 + 链路深度 vs 成本；§5.4.B 标 ✅（知识沉淀；step-N 演示不是本条必做，对应模块是 07 / 11）；之前的"接着讲"确实漏沉了 |
| 「step5 应该讲什么」 → 答：本轮三候选 A/B/C；学习者选 A（模型自编排 + 错误自纠）；落 step-5：while + decideNextAction mock + 自纠触发（query 短 → 扩 query）+ MAX_ROUNDS 边界（query 含 ❌ 标记触发）；实测三场景：AI 自纠成功 / Function Calling 2 轮收敛 / ❌ MAX_ROUNDS 触发 |
| 「按 A 走」 → 落 step-5（copy step-4 + 替换 chain 为 self-correct 场景）：2 个 Tool（search_doc + summarize，search_doc 加 ❌ 标记永久返空 + length<3 触发空结果）+ routes/self-correct.ts while + MAX_ROUNDS + decideNextAction mock + final reply；pages/self-correct.html（query 输入 + 每轮决策轨迹 + 自纠标记 + final reply） |
| 「为什么我刚刚不问你，你都不会告诉我，这个自我编排这个模式？我在agents不是约定的是由浅入深吗？为什么感觉你这个东西都会忘记？是不是这个有问题啊？」 → **2026-09-04 最重要的一条追问**。承认错误：把 MD 需求清单当"本条要 demo 的清单"（2 条 happy-path）而不是"核心概念的所有变体"（5 个变体）。修补 6 处：① agents/06-teach.md §6.3 讲完前自查触发器（含 case study + 判别信号）② AGENTS.md §1 底线扩 4 条（含「核心概念所有变体未覆盖 = 没讲完」）③ MD 需求清单 2 条 → 5 条 ④ agents/{03-progress,05-demo,07-notes} 三处加 §6.3 工作流钩子 ⑤ MD §5.4.B 闸门表扩到 5 条证据行 ⑥ memory 写入 feedback 记忆。下次进 02 Tool Description 前必须主动列变体 |
| 「按照这个改」 → 已落实：6 改动全 grep 验证（12 处 §6.3 引用 + 5 条 §5.4.B 证据行 + Case study 块） |
| 「你确定吗？确定落好了，我要不是自己发现，这就过了，知识都没学完」 → 承认前面那次嘴上说"全部改完"是过于自信；列了 5 个真正的缺口（A 工作流钩子 / B demo 判断块 / C 沉淀对齐 / D 闸门表扩到 5 行 / E case study），全部补完。本轮 grep 验证 12 处引用 + 5 行证据 + case study 在位 |

---

## Demo 子节进度

| 状态 | 子节 | 入口 | 端口 | 本子节教学点 |
|------|------|------|------|--------------|
| ✅ | step-1 | `yarn app:05-01-fc-protocol-step-1` | `50017` | 完整一圈 tool_call → execute → tool_result → final_reply（含并行 / 多 Tool Registry / Gateway 校验 · mock 不调 LLM · §5.3.2 6 项齐） |
| ✅ | step-2 | `yarn app:05-01-fc-protocol-step-2` | `50018` | 把 mock 换成真 LLM（协议 A：openai.chat.completions）；请求/响应字段全量前端可视化；§5.3.2 6 项齐 |
| ✅ | step-3 | `yarn app:05-01-fc-protocol-step-3` | `50019` | 3 个 async Tool（search_flight 80ms / get_weather 50ms / get_packing_list 30ms）+ `Promise.all` 真并发 + gantt 时序图 + 串/并行对比按钮（修 §5.4.A2 阻塞 · mock 不调 LLM · §5.3.2 6 项齐） |
| ✅ | step-4 | `yarn app:05-01-fc-protocol-step-4` | `50020` | 串行依赖链：search_doc → summarize（B 用 A 输出当参数）；路由层 hard-code A→B 链；§5.3.8 页与接口 1:1（独立 page + 独立 route）+ gantt 链式时序 |
| ✅ | step-5 | `yarn app:05-01-fc-protocol-step-5` | `50021` | 模型自编排：while + finish_reason 循环骨架 + 每轮 decideNextAction mock 决定 + 自纠触发（query 短 → 扩 query 重试）+ MAX_ROUNDS 边界 + 业务降级 |

## §5.4 目标 ↔ 代码整合闸门

跑闸门日期：2026-09-04（[AGENTS.md §5.2 闸门 = 三件事](../AGENTS.md#52-小节-demo)：MD §7.2 + Demo §5.2 + 目标↔代码 §5.4；本节跑 §5.4）

跑闸门日期：2026-09-04（重跑 · step-3 已落；`node scripts/check-demo.cjs 05-Tool-Calling/01-Function-Calling-协议-step-3` 全部通过；curl 实测 `mode=parallel` totalMs=82 / `mode=serial` totalMs=165 / 3 tool_call 并行 startMs=0 串行堆叠）

跑闸门日期：2026-09-04（重跑 · step-4 已落；`node scripts/check-demo.cjs 05-Tool-Calling/01-Function-Calling-协议-step-4` 全部通过；curl 实测 `POST /api/chain` totalMs=134 / step1 search_doc 0→82ms / step2 summarize 82→134ms（链式堆叠）/ finalSummary 三种 style 全跑通）

### §5.4.A 目标 → 代码覆盖

「本条要能讲清」：**能画出这一圈，含并行调用**。

| 目标点 | 状态 | 证据 |
|---|---|---|
| A1 能画出 5 动作一圈（model → tool_call → execute → tool_result → final_reply） | ✅ | step-1 五张卡片 `#card-input` `#card-decide` `#card-execute` `#card-result` `#card-final`；step-2 `#llm-protocol` Round 1/2 Request/Response 四张卡 |
| A2 **含并行调用** | ✅ | step-3 [routes/plan.ts:79-90](../apps/05-Tool-Calling/01-Function-Calling-协议-step-3/routes/plan.ts#L79) `Promise.all(promises)` 真并发（handler 全 async）；实测 `mode=parallel` 3 条 tool_call startMs=0、endMs=32/51/82、totalMs=82（=max 单 handler 耗时）；前端 gantt 时序图把 3 个 bar 同时起步画出来 |

**A 段小结**：**过**。

### §5.4.B 文档 → 代码对齐

| MD 讲点 | 代码里有没有 | 状态 |
|---|---|---|
| 「例子 4 · 前端：**并行**调用（旅游规划助手）—— 5 月东京 7 天要带什么、机票多少钱？」（三个 tool_call → Promise.all 并发） | step-3 「跑并行」按钮 → POST /api/plan { scenario: tokyo-may-7days, mode: parallel } → 3 个 tool_call（search_flight / get_weather / get_packing_list）Promise.all 并发；前端 gantt 时序图展示 | ✅ |
| 「易混点：并行调用 ≠ SDK 自动；必须 `Promise.all`」 | step-3 [routes/plan.ts:79](../apps/05-Tool-Calling/01-Function-Calling-协议-step-3/routes/plan.ts#L79) `Promise.all(promises)` 真调用；[registry.ts:74-86](../apps/05-Tool-Calling/01-Function-Calling-协议-step-3/lib/tools/registry.ts#L74) `await tool.handler(...)` 异步执行 | ✅ |
| 「踩坑：串行 `for await` 执行 → 模型嫌慢 → 编造结果」 | step-3 [routes/plan.ts:95-108](../apps/05-Tool-Calling/01-Function-Calling-协议-step-3/routes/plan.ts#L95) 串行分支 `for (const c of calls) await executeTool(...)`；前端「跑串行」按钮 + 「串/并行对比」按钮对比总耗时（实测 82ms vs 165ms） | ✅ |
| 「核心对象 ④ · `tool_result` 必须把成功**或失败**都回传」（catch → `{ok:false, error}` 塞回） | step-1 / step-2 都把 Zod 失败 / Gateway 拒绝当成 `ExecResult {ok:false}` 返回，再回灌 `tool` 消息；step-3 [registry.ts:84-90](../apps/05-Tool-Calling/01-Function-Calling-协议-step-3/lib/tools/registry.ts#L84) `try/catch` 包 handler 抛错，返 `ExecResult {ok:false, error}` | ✅ |
| 「例子 5 · 前端：**串行依赖**调用（RAG 风格 · search_doc → summarize）」 | step-4 `routes/chain.ts` 路由层 hard-code await 链：A = await search_doc(query)；B = await summarize(content=A.result, style)；**不**用 Promise.all；实测 step1 0→82ms / step2 82→134ms / totalMs=134 | ✅ |
| 「例子 5.5 · 模型自己编排链（while + finish_reason === "tool_calls" 循环）」 | step-5 `routes/self-correct.ts` 真 while 循环骨架 + MAX_ROUNDS=4 边界；`lib/tools/registry.ts` `decideNextAction` mock LLM 决策；实测三场景：① query="AI" 触发 Round2 自纠成功 → 4 轮 totalMs=222；② query="Function Calling" 2 轮收敛 → 3 轮 totalMs=135；③ query="❌"（含 ❌ 标记）→ MAX_ROUNDS 触发 → 业务降级 finalReply 返 structured error | ✅ |
| 「选型准则：主轴 = 依赖关系」 | step-3 routes/plan.ts 用 Promise.all（独立）；step-4 routes/chain.ts 用 await chain（依赖）；step-5 routes/self-correct.ts while + 自纠 —— 同一份代码骨架、三种编排方式 | ✅ |
| 「三种编排方式对比」（硬编码 / 模型自由 / 混合） | step-4 硬编码串行 ✓；step-5 模型自由 ✓；混合（路由层允许调但 hard-code tool 列表）**没专门 step-N 演示** —— 模块 13 框架的活 | ✅（两种极端已覆盖；混合非本条必做） |
| 「链路深度 vs 成本」 | MD 列表 ✓（context 长 / 响应慢 / token 贵 + 三个降本模块入口） | ✅（知识沉淀；本条不要求代码） |
| 「踩坑：独立 IO 写串行」 | step-3 routes/plan.ts:95-108 串行分支（按 mode=serial 走，故意让"独立 IO 串行"成为可观察证据）；step-4 串行是**依赖**（不是反例） | ✅ |
| 「协议 A vs B 字段对照表」（同圈两套写法；强制 `max_tokens` 等） | step-2 协议 A 完整字段；step-1 / step-2 / step-3 都没起协议 B Demo | ❌（**单向缺口 · 不阻塞**：MD 写了 A vs B 对照但本条 demo 只跑 A；协议 B 是模块 02 / 其它条对照） |
| 「需求清单 · 需求 1（旅游规划助手 · 并行调用）」（场景 / 目标 / 涉及知识点 / 验收 5 条） | step-3 全覆盖：场景"5 月东京 7 天"（planToolCalls tokyo-may-7days）+ 3 个 tool_call + handler async + Promise.all + gantt 时序图 + 串/并行对比按钮 | ✅ |
| 「需求清单 · 需求 2（串行 vs 并行 · 对比按钮 · 总耗时 + 是否编造）」 | step-3 `routes/compare.ts` 服务端并发跑 parallel + serial 两个 sub-dispatch → 返 `{parallelRun, serialRun, speedup}`；前端「串/并行对比」按钮发 1 次 POST（不混 `/api/plan`）；实测 speedup ≈ 2.05× | ✅ |
| 「需求清单 · 需求 3（串行依赖 · search_doc → summarize · B 用 A 输出）」 | step-4 `routes/chain.ts` 路由层 hard-code await 链：A = await search_doc(query) → B = await summarize(content=A.result, style)；**不**用 Promise.all；实测 step1 0→82ms / step2 82→134ms / totalMs=134；错误反例代码块对比（Promise.all 拿 undefined） | ✅ |
| 「需求清单 · 需求 4（模型自编排 · while + finish_reason 多轮链）」 | step-5 `routes/self-correct.ts` 真 while 循环骨架 + MAX_ROUNDS=4；`decideNextAction` mock LLM 决策；选型三档对照（硬编码串行 ✓ / 模型自由 ✓ / 混合 = 模块 13 框架的活） | ✅ |
| 「需求清单 · 需求 5（自纠 + 边界 · 空 tool_result → 换 query 重试）」 | step-5 故意触发失败（query 含 ❌ 标记 / length<3）→ 自纠触发 Round2 扩 query 重试；MAX_ROUNDS 触发 → 业务降级返 structured error；实测三场景（query="AI" 4 轮自纠成功 / "Function Calling" 3 轮收敛 / "❌" 4 轮 MAX_ROUNDS 触发） | ✅ |
| 「§5.4.A 教学点覆盖（5 个变体 = 5 条需求全过）」 | 需求 1 / 2 → step-3 ✅；需求 3 → step-4 ✅；需求 4 / 5 → step-5 ✅；每个变体都有 step-N 演示 + 通俗例子 + 贴近业务需求（详 §6.3 变体覆盖自查触发器） | ✅ |

**B 段小结**：**过**。缺口 1 条（协议 B 单向缺口 · 标 ❌ 不阻塞本条 §5.4；是模块分工问题）。

**5 条需求 ↔ 5 个变体 ↔ 5 个 step-N 证据行**：详见「需求清单」节末的变体对照表 + 上面 §5.4.B 行。**漏一个变体 = §5.4.B 不过**（2026-09-04 维护前漏 ③④⑤ 三个变体就是踩坑实例；详 §6.3 case study）。

### §5.4 闸门结论

- §5.4.A：**过**（A1 + A2 都有证据）
- §5.4.B：**过**（需求清单 1 / 2 + A2 同源 3 条 + 核心对象 ②④ 都对齐；协议 B 单向缺口不阻塞；2026-09-04 step-4 重跑后 B 段新增 3 行：例子 5 / 选型准则 / 独立 IO 写串行 全部 ✅；step-5 重跑后例子 5.5 从 ❌ → ✅（while + 自纠 + MAX_ROUNDS 三场景全跑通））

→ **本条 §5.4 闸门已过**。下一步：学习者主动决定是否**锁定 step-4**（[§5.3.14 锁定 = 学习者主动决策](../agents/05-demo.md#交互检查点协议每步之间必走)；step-3 已 ✅，step-4 check-demo.cjs 已过 + §5.3.2 6 项齐：happy path 跑链按钮、错误处理 2 类（HTTP 400 empty query + bad style）、Loading `#status-pill` 四态、#output 展示链式时序图 + 2 tool_result + final summary、`GET /health` + #env-info、#page-intro 自解释）。锁定后 → `coach complete` 走 [§7.2 / §5.2 / §5.4 三件事闸门](../AGENTS.md#52-小节-demo) 判勾本条 ✅。
