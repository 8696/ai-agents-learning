# 04 · Structured Output · 02 协议 B 版 · JSON Mode vs Tool-Use

**协议 B（Anthropic Messages API）** 视角下的结构化输出对照 Demo — §5.3 完整版、§5.3.8 按职责分层。只跑协议 B（`@anthropic-ai/sdk`），不 import 协议 A 那一份。

是 [`02-JSON-Mode-vs-Structured-Output/`](../02-JSON-Mode-vs-Structured-Output/README.md) **协议 A 版的镜像**：同一组 5 个诱导用例、同一组分析维度。§5.3.13 B 版分拆，端口按占用表顺序分配。

## 怎么跑

```bash
cd apps
yarn app:04-02-anthropic-tool-use-step-1
```

启动后打开 <http://127.0.0.1:50016/>。

## 端口

`50016` —— §5.3.3 顺序分配（占用表当前最大 + 1）。可用 `PORT=` 单次覆盖。不要把 `PORT` 写进 `apps/.env`。

## 数据流

```text
场景页 (public/pages)
  → utils/api-client.js
  → POST /api/text | /api/tool-use | /api/tool-rejected
  → routes/*（薄：闸门 → flow → ctx.body）
  → lib/flow/*（messages.create + 剥壳或直接 Zod）
  → lib/schema/intent.ts（同一份 Intent 契约 + input_schema）
```

## 文件结构

```
02-JSON-Mode-vs-Tool-Use-ProtoB/
├── server.ts                 # 只装配
├── routes/                   # health / text / tool-use / tool-rejected
├── lib/
│   ├── http/                 # runtime-ctx / request-guards / write-upstream-error
│   ├── schema/               # Intent Zod + Anthropic input_schema
│   └── flow/                 # 剥壳分析 + 三条路径各自的一次调用
├── README.md
└── public/
    ├── index.html            # 总览（不调模型）
    ├── pages/                # text / tool-use / tool-rejected
    ├── components/           # layout · mode-cards
    └── utils/                # api-client / wait-demo-ui / presets
```

只 import `apps/llm.ts`（`getLlmOptional`）。不 import 协议 A 小节、不 import 其它小节。

## API 表面 · 协议 A vs B

| 维度 | 协议 A · OpenAI Chat Completions | 协议 B · Anthropic Messages API |
| --- | --- | --- |
| **闸的字段名** | `response_format` | `tools[].input_schema` + `tool_choice` |
| **JSON Mode 等价路径** | `response_format: { type: "json_object" }` | **没有等价字段** — 只能无 `tools` + prompt 强写"返回 JSON" |
| **Structured Output 等价路径** | `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }` | `tools: [{ name, description, input_schema }]` + `tool_choice: { type: "tool", name }` |
| **闸的实现机制** | strict 时真 token-mask；不 strict 时软约束 | input_schema 倾向让模型守；tool_choice 强制调函数；没有 token-mask |
| **写在哪** | 模型吐在 `choices[0].message.content`（字符串，要 JSON.parse） | 模型吐在 `content[type="tool_use"].input`（已是解析好的对象，无须 parse） |
| **schema 写法严格度** | strict 强制白名单：禁止 `anyOf` / 必须 `additionalProperties:false` / 必列 `required` | 宽松得多：接受 `anyOf` / `$defs`；推荐 `description` |
| **结构里允许额外字段** | strict 不允许 | input_schema 默认允许（除非显式 `additionalProperties:false`，本 Demo 仍写白名单） |

**核心结论**：协议 A 的语义闸是 `strict: true` 一个字段物理层；协议 B 是 input_schema + tool_choice 两字段软约束。**两边都不是完美硬闸——都要在服务端用 Zod 做最后一道兜底。**

## 四个端点

| 端点 | 做什么 | 类比协议 A 的什么 |
| --- | --- | --- |
| `GET /health` | `{ ok, port, provider, model, hasKey }` | `model` = `modelB`；页脚写「协议 B」 |
| `POST /api/text { prompt }` | 无 `tools`、纯 `messages.create()`；模型按 prompt 强约束吐文本 | ≈ `response_format: { type: "json_object" }`（语法闸弱对应） |
| `POST /api/tool-use { prompt }` | `tools: [INTENT_TOOL]` + `tool_choice: { type: "tool", name: "Intent" }` | ≈ `json_schema` + `strict: true`（语义闸软对应） |
| `POST /api/tool-rejected` | 不发坏 schema（**Anthropic 不会 400**）；prompt 强引导违 enum，看守约 | 协议 A 里那条「坏 schema → API 400」——测的不是一回事 |

## §5.3.2 六项

| # | 项 | 在本 Demo 怎么体现 |
| --- | --- | --- |
| 1 | **Happy path** | 5 个预设用例；text 页与 tool-use 页各跑同一组 prompt |
| 2 | **错误处理**（≥ 2 类） | (a) fetch reject → ErrorBanner；(b) 空 prompt 400 / 没 Key 503 / 上游 4xx·5xx；(c) Zod 失败显示 issues |
| 3 | **Loading 状态** | `#status-pill` = 🔄请求中，按钮 `disabled` |
| 4 | **单会话输出区** | `#output` 按调用追加，最新在顶 |
| 5 | **环境元信息** | `GET /health` + 页脚 `#env-info`（协议 B · model 来自 modelB） |
| 6 | **页面自解释** | `#page-intro` + 控件旁「点了会发生什么」 |

无 Key 时页脚显示 `Key ❌`，各页主按钮直接 disabled。

## 5 个预设用例（与协议 A demo 完全镜像）

| # | 标题 | 触发的事 |
| --- | --- | --- |
| ① | 简单命令 | action=search / query=咖啡 |
| ② | 带 enum 诱导 | action=order；Anthropic 端是 input_schema 里 enum 限制 |
| ③ | 故意诱导 schema 违规 | prompt 要 action='unknown'，看模型是否让 schema 压过 prompt |
| ④ | 自由发挥字段名 | text 路径可能给自由字段名；tool-use 因 input_schema 强制只有 action/query/qty |
| ⑤ | 带 qty（optional） | qty 字段在 tool-use 路径下也被允许为空 |

外加「⑥ prompt 诱导模型违 input_schema · 看守约」独立页。

## 当前能做什么

- 看同一段 prompt 在 text vs tool-use 下输出的差异（左 raw 是模型原始文本，右 raw 是 tool_use.input）
- 看协议 B 的工具模型对 enum 外的字段如何反应（守还是不守）
- 看协议 A vs B 的 `tool_use` 相比 `response_format` 在「闸」上软硬程度的真实差别
- 把 5 个用例一键顺序跑，**正面对照** 协议 A Demo（端口 50015）

## 对应学习沉淀

- 文档：[`docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md`](../../../docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md)
- 进度：[模块 04 · Structured Output · 小节进度](../../../docs/学习模块/04-Structured-Output/README.md)

## 没在这里做的事

- 不演示 protocol A vs B **同 prompt 同时跑**并排——那是模块 02 的对照条
- 不演示 multi-tool / streaming tool_use / prompt caching
- 不演示协议 B 的 `parallel_tool_calls` 等价物
- 国内各 provider 的协议 B 实装差异表（实测时再补）
