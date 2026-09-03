# **Function Calling 协议**：model → tool_call → execute → tool_result → model

> 对应模块：[模块 05 · Tool Calling / Function Calling ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 1 条

- **来源**：本对话（`coach start` 详解 §6.2 + 落 step-1 锁定 + step-2 真 LLM）+ 2026-09-04 重新讲解一轮（补「需求清单」独立节 + 「例子 4」点名 §5.4.A2）+ MiniMax-M3 实测响应（[apps/05-Tool-Calling/01-Function-Calling-协议-step-2](../../apps/05-Tool-Calling/01-Function-Calling-协议-step-2/README.md)）
- **状态**：已沉淀 · 2026-09-03
- **Demo**：已落 `apps/05-Tool-Calling/01-Function-Calling-协议-step-1/`（✅ 锁定 · mock 不调 LLM）+ `…-step-2/`（✅ 锁定 · 真 LLM 协议 A · 请求/响应可视化）+ **`…-step-3/`（⬜ 未建 · 并行调用 + 时序图 + 串/并行对比按钮 · 待学习者按「需求清单」决定启动）** —— 详见 [§Demo 子节进度](#demo-子节进度)

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

## 例子（4 个，覆盖每个核心对象）

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

## 需求清单（业务需求 · §6.2 item 6 硬性要求）

每核心对象 ≥1 条贴近业务的需求（**验收准绳，不是 step 生产的驱动器**——step 生产仍按本节知识动态推进 [§5.3.14](agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)；`coach next` 勾 ✅ 时按需求**逐条对**）。

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
| 并行调多个 tool_call 时怎么写？ | 核心对象 ③ + 例子 4 + 踩坑"串行 for await" |
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

---

## Demo 子节进度

| 状态 | 子节 | 入口 | 端口 | 本子节教学点 |
|------|------|------|------|--------------|
| ✅ | step-1 | `yarn app:05-01-fc-protocol-step-1` | `50017` | 完整一圈 tool_call → execute → tool_result → final_reply（含并行 / 多 Tool Registry / Gateway 校验 · mock 不调 LLM · §5.3.2 6 项齐） |
| ✅ | step-2 | `yarn app:05-01-fc-protocol-step-2` | `50018` | 把 mock 换成真 LLM（协议 A：openai.chat.completions）；请求/响应字段全量前端可视化；§5.3.2 6 项齐 |

## §5.4 目标 ↔ 代码整合闸门

跑闸门日期：2026-09-04（[AGENTS.md §5.2 闸门 = 三件事](../AGENTS.md#52-小节-demo)：MD §7.2 + Demo §5.2 + 目标↔代码 §5.4；本节跑 §5.4）

### §5.4.A 目标 → 代码覆盖

「本条要能讲清」：**能画出这一圈，含并行调用**。

| 目标点 | 状态 | 证据 |
|---|---|---|
| A1 能画出 5 动作一圈（model → tool_call → execute → tool_result → final_reply） | ✅ | step-1 五张卡片 `#card-input` `#card-decide` `#card-execute` `#card-result` `#card-final`；step-2 `#llm-protocol` Round 1/2 Request/Response 四张卡 |
| A2 **含并行调用** | ❌ | step-1 [routes/chat.ts:85](../apps/05-Tool-Calling/01-Function-Calling-协议-step-1/routes/chat.ts#L85) `model_tool_calls.map(...)` 同步；[registry.ts:50](../apps/05-Tool-Calling/01-Function-Calling-协议-step-1/lib/tools/registry.ts#L50) `executeTool` 同步返回；两个 Tool handler（[get-weather.ts](../apps/05-Tool-Calling/01-Function-Calling-协议-step-1/lib/tools/get-weather.ts) / [search.ts](../apps/05-Tool-Calling/01-Function-Calling-协议-step-1/lib/tools/search.ts)）同步；step-2 [routes/chat.ts:114](../apps/05-Tool-Calling/01-Function-Calling-协议-step-2/routes/chat.ts#L114) 同步 `.map`；grep `Promise.all` 全模块 0 处实际调用（4 处全在注释/docstring/前端文案） |

**A 段小结**：**不过**。缺口 1 条（A2）。

> A2 缺口补法（建议，由学习者决定）：
> - 修法 1：把 step-2 的 Tool handler 改成 async（哪怕 `await sleep(50ms)`），execute 路径换成 `Promise.all(calls.map(...))`；前端用时序图把"两个同时起步、独立完成"画出来；改成 step-2 真 LLM 演示
> - 修法 2：保留 step-1 / step-2 不动，建 `…-step-3/` 专演示并行调用（mock + Promise.all + 时序图），与 step-2 并列
> - **禁止**：把 A2 写成"Promise.all 是教学建议，代码里同步也行"——目标点是「含并行调用」可观察行为，不是「提到了 Promise.all」

### §5.4.B 文档 → 代码对齐

| MD 讲点 | 代码里有没有 | 状态 |
|---|---|---|
| 「例子 4 · 前端：**并行**调用（旅游规划助手）—— 5 月东京 7 天要带什么、机票多少钱？」（三个 tool_call → Promise.all 并发） | step-1 / step-2 都没有这个场景按钮；handler 同步；前端无并发时序图 | ❌ |
| 「易混点：并行调用 ≠ SDK 自动；必须 `Promise.all`」 | 代码无 `Promise.all` 调用 | ❌ |
| 「踩坑：串行 `for await` 执行 → 模型嫌慢 → 编造结果」 | 同步 `.map`；无「串行 vs 并行」对比按钮；前端无延迟对比 | ❌ |
| 「核心对象 ④ · `tool_result` 必须把成功**或失败**都回传」（catch → `{ok:false, error}` 塞回） | step-1 / step-2 都把 Zod 失败 / Gateway 拒绝当成 `ExecResult {ok:false}` 返回，再回灌 `tool` 消息 | ✅ |
| 「核心对象 ② · `tool_call.arguments` 是 **JSON 字符串** 不是对象；先 `JSON.parse`」 | step-2 [routes/chat.ts:117-119](../apps/05-Tool-Calling/01-Function-Calling-协议-step-2/routes/chat.ts#L117) 显式 `JSON.parse` + try/catch | ✅ |
| 「协议 A vs B 字段对照表」（同圈两套写法；强制 `max_tokens` 等） | step-2 协议 A 完整字段；step-1 / step-2 都没起协议 B Demo | ❌（**单向缺口**：MD 写了 A vs B 对照但本条 demo 只跑 A；协议 B 留给 02 / 04 / 其它条对照） |
| 「需求清单 · 需求 1（旅游规划助手 · 并行调用）」（场景 / 目标 / 涉及知识点 / 验收 5 条） | step-1 / step-2 都没起"5 月东京 7 天"按钮；handler 同步；前端无时序图 | ❌（**新缺口**：step-3 候选教学点） |
| 「需求清单 · 需求 2（串行 vs 并行 · 对比按钮 · 总耗时 + 是否编造）」 | 无"串/并行对比"按钮；无总耗时记录 | ❌（**新缺口**：step-3 候选教学点） |

**B 段小结**：**不过**。缺口 6 条（前 3 条与 A2 同源；末条协议 B 是分工问题标 ❌ 不阻塞；最后 2 条「需求清单 1 / 2」是本轮 2026-09-04 增量新增的 MD 讲点 → step-3 候选教学点 → 当前 ❌）。

### §5.4 闸门结论

- §5.4.A：**不过**（A2 缺真实并行调用代码证据）
- §5.4.B：**不过**（6 条 MD 讲点代码里没有；前 3 条与 A2 同源，末条协议 B 是分工问题，最后 2 条「需求清单 1 / 2」是本轮 2026-09-04 增量新增）

→ **本条不准勾 ✅**。模块 README 第 1 行 ⬜ 保持不变（与现状一致）。下一步：学习者按「[需求清单 · 需求 1 / 2](#需求清单业务需求--62-item-6-硬性要求)」决定启动 step-3（mock 三 Tool · handler async · Promise.all · 时序图 · 串/并行对比按钮）；落完跑 `node scripts/check-demo.cjs`，再跑一遍 §5.4；都过才进 02 Tool Description。
