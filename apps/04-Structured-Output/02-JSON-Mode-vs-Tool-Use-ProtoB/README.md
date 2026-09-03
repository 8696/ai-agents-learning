# 04 · Structured Output · 02 协议 B 版 · JSON Mode vs Tool-Use

**协议 B（Anthropic Messages API）** 视角下的"结构化输出"对照 Demo — §5.3 完整版（前后端，浏览器可视化）。

是 [`02-JSON-Mode-vs-Structured-Output/`](../02-JSON-Mode-vs-Structured-Output/README.md) **协议 A 版的镜像**：同一组 5 个诱导用例、同一组分析维度，用 **Anthropic SDK** 走一遍，并排对照两条协议的"API 表面 + 闸的位置 + 模型守约"。

## 怎么跑

需要 `.env` 里有协议 B 的 key（看 `LLM_PROVIDER` 配置——多数国内网关同时支持协议 A 和 B 两套端口；OpenAI 的 OpenAI SDK 接到 Anthropic base URL 这种用法不通用）。

```bash
cd apps
yarn app:04-12-anthropic-tool-use
```

启动后打开 <http://127.0.0.1:50412/>。

## 端口

`50412` —— 公式 `5{模块两位}{小节两位 +10}` = `5` + `04` + `12`。
> 这是该小节第二份 HTTP Demo，按 [AGENTS.md §5.3.3](../../AGENTS.md#533-目录与脚本) 小节两位 `+10` 的公式取（第一份 `50402`，第二份 `50412`）。
可用 `PORT=` 单次覆盖。

## API 表面 · 协议 A vs B 一图看清

| 维度 | 协议 A · OpenAI Chat Completions | 协议 B · Anthropic Messages API |
| --- | --- | --- |
| **闸的字段名** | `response_format` | `tools[].input_schema` + `tool_choice` |
| **JSON Mode 等价路径** | `response_format: { type: "json_object" }` | **没有等价字段** — 只能无 `tools` + prompt 强写"返回 JSON" |
| **Structured Output 等价路径** | `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }` | `tools: [{ name, description, input_schema }]` + `tool_choice: { type: "tool", name }` |
| **闸的实现机制** | strict 时真 token-mask；不 strict 时软约束 | input_schema 倾向让模型守；tool_choice 强制调函数；没有 token-mask |
| **写在哪** | 模型吐在 `choices[0].message.content`（字符串，要 JSON.parse） | 模型吐在 `content[type="tool_use"].input`（已是解析好的对象，无须 parse） |
| **schema 写法严格度** | strict 强制白名单：禁止 `anyOf` / 必须 `additionalProperties:false` / 必列 `required` | 宽松得多：接受 `anyOf` / `$defs`；推荐 `description` |
| **结构里允许额外字段** | strict 不允许 | input_schema 默认允许（除非显式 `additionalProperties:false`，本 Demo 仍写白名单） |
| **request body 顶层多字段** | `messages`, `tools`, `tool_choice`, `response_format` 共存 → **容易双触发** | `system`, `messages`, `tools`, `tool_choice`，结构化就在 tool 路径上 |

**核心结论**：协议 A 的"语义闸"是 response_format 那一个 `strict: true` 字段，物理层；协议 B 是 input_schema + tool_choice 两个字段一起做，靠模型的"倾向"和"被强制选 tool"两层软约束。**两边都不是完美的"硬闸"——都要在服务端用 Zod 做最后一道兜底。**

## 三个端点

| 端点 | 做什么 | 类比协议 A 的什么 |
| --- | --- | --- |
| `GET /health` | `{ ok, port, protocol: "B", model, provider, hasKey }` | 同协议 A，但 `protocol: "B"` 区别 |
| `POST /api/text { prompt }` | 无 `tools`、纯 `messages.create()`；模型按 prompt 强约束吐文本 | ≈ `response_format: { type: "json_object" }`（语法闸弱对应） |
| `POST /api/tool-use { prompt }` | `tools: [INTENT_TOOL]` + `tool_choice: { type: "tool", name: "Intent" }` | ≈ `response_format: { type: "json_schema", strict: true }`（语义闸软对应） |
| `POST /api/tool-rejected` | 不发坏 schema（**Anthropic 不会 400**）；改用 prompt 强引导模型违 input_schema 的 enum，看守约 | 协议 A 里那条"故意 schema 写法不对 → API 400" |

## §5.3.2 四项

| # | 项 | 在本 Demo 怎么体现 |
| --- | --- | --- |
| 1 | **Happy path** | 5 个预设用例一键跑，每一对左右并排对比 text vs tool-use |
| 2 | **错误处理**（≥ 2 类） | (a) 没 Key 时 `#status-pill` 红 / 端点 503；(b) Anthropic API 错（如 401/400/429）回 5xx + 把报错原文回前端；(c) tool_use input Zod 校验失败时显示 issues 列表 |
| 3 | **Loading 状态** | `#status-pill` = 🔄请求中，按钮 disabled |
| 4 | **单会话输出区** | `#output` 区按调用追加显示，最新用例在顶 |

## 5 个预设用例（与协议 A demo 完全镜像）

| # | 标题 | 触发的事 |
| --- | --- | --- |
| ① | 简单命令 | action=search / query=咖啡 |
| ② | 带 enum 诱导 | action=order；Anthropic 端是 input_schema 里 enum 限制 |
| ③ | 故意诱导 schema 违规 | prompt 要 action='unknown'，看模型是否让 schema 压过 prompt |
| ④ | 自由发挥字段名 | text 路径可能给自由字段名；tool-use 因 input_schema 强制只有 action/query/qty |
| ⑤ | 带 qty（optional） | qty 字段在 tool-use 路径下也被允许为空 |

外加「⑥ prompt 诱导模型违 input_schema · 看守约」独立按钮——Anthropic 不在 API 入口拒 schema，所以这刀测的是**模型的守约能力**（协议 A 那侧测的是 API 入口拒收坏 schema；两边都重要，但测的不是一回事）。

## 当前能做什么

- 看同一段 prompt 在 text vs tool-use 下输出的差异（左 raw 是模型原始文本，右 raw 是 tool_use block 的 input 解析后的对象）
- 看 protocol B 的工具模型对 enum 外的字段如何反应（守还是不守）
- 看协议 A vs B 的 `tool_use` 相比 `response_format` 在"闸"上软硬程度的真实差别
- 把 5 个用例一键顺序跑，**正面对照** 协议 A Demo（端口 50402）

## 对应学习沉淀

- 文档：[`docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md`](../../docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md)
- 进度：[模块 04 · Structured Output · 小节进度](../../docs/学习模块/04-Structured-Output/README.md#小节进度)

## 没在这里做的事（留给后续条目 / 其它模块）

- 不演示 protocol A vs B **同 prompt 同时跑**并排的"协议 A/B 对照板"——那是模块 02 的 `02-协议-A-vs-B`，不是本条
- 不演示 multi-tool（一次给多个 tool + `tool_choice: any`）的场景
- 不演示 streaming 协议 B 的 tool_use 流式解码（messages.stream 路径）
- 不演示 Anthropic prompt caching（tools 缓存 / system caching 这条路径）
- 不演示协议 B 的 `parallel_tool_calls` 等价物（Anthropic 无此 API，模型自然可以并行调多次）
- 国内各 provider 的协议 B 实装差异表（实测时再补）
