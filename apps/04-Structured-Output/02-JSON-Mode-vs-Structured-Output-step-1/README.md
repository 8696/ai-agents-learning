# 04 · Structured Output · 02 协议 A 版 · JSON Mode vs Structured Output

**协议 A（OpenAI Chat Completions）** 视角下的结构化输出对照 Demo — §5.3 完整版、§5.3.8 按职责分层。只跑协议 A（`openai`），不 import 协议 B 那一份。

是 [`02-JSON-Mode-vs-Tool-Use-ProtoB/`](../02-JSON-Mode-vs-Tool-Use-ProtoB/README.md) **协议 B 版的镜像**：同一组 5 个诱导用例、同一组分析维度。

## 怎么跑

```bash
cd apps
yarn app:04-02-json-mode-vs-structured-output-step-1
```

启动后打开 <http://127.0.0.1:50015/>。

## 端口

`50015` —— §5.3.3 顺序分配（占用表当前最大 + 1）。可用 `PORT=` 单次覆盖。不要把 `PORT` 写进 `apps/.env`。

## 数据流

```text
场景页 (public/pages)
  → utils/api-client.js
  → POST /api/json-mode | /api/structured-output | /api/strict-rejected
  → routes/*（薄：闸门 → flow → ctx.body）
  → lib/flow/*（create + 剥壳 + JSON.parse + Zod + analysis）
  → lib/schema/intent.ts（同一份 Intent 契约）
```

## 文件结构

```
02-JSON-Mode-vs-Structured-Output/
├── server.ts                 # 只装配
├── routes/                   # health / json-mode / structured-output / strict-rejected
├── lib/
│   ├── http/                 # runtime-ctx / request-guards / write-upstream-error
│   ├── schema/               # Intent Zod + JSON Schema + 坏 schema
│   └── flow/                 # 剥壳分析 + 三道闸各自的一次调用
├── README.md
└── public/
    ├── index.html            # 总览（不调模型）
    ├── pages/                # json-mode / structured / strict-rejected
    ├── components/           # layout · mode-cards
    └── utils/                # api-client / wait-demo-ui / presets
```

只 import `apps/llm.ts`（`getLlmOptional`）。不 import 其它小节。

## API 表面 · 协议 A vs B

| 维度 | 协议 A · OpenAI Chat Completions | 协议 B · Anthropic Messages API |
| --- | --- | --- |
| **闸的字段名** | `response_format` | `tools[].input_schema` + `tool_choice` |
| **JSON Mode** | `response_format: { type: "json_object" }` | **没有等价字段** |
| **Structured Output** | `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }` | `tools: [{ name, description, input_schema }]` + `tool_choice: { type: "tool", name }` |
| **闸的实现机制** | strict 时真 token-mask；不 strict 时软约束 | input_schema 倾向让模型守；tool_choice 强制调函数；没有 token-mask |
| **写在哪** | 模型吐在 `choices[0].message.content`（字符串，要 JSON.parse） | 模型吐在 `content[type="tool_use"].input`（已是解析好的对象，无须 parse） |
| **schema 写法严格度** | strict 强制白名单：禁止 `anyOf` / 必须 `additionalProperties:false` / 必列 `required` | 宽松得多：接受 `anyOf` / `$defs`；推荐 `description` |

**核心结论**：协议 A 的语义闸是 `response_format.strict: true` 一个字段物理层；协议 B 是 input_schema + tool_choice 两字段软约束。**两边都不是完美硬闸——都要在服务端用 Zod 做最后一道兜底。**

## 四个端点

| 端点 | 做什么 | 关键字段 |
| --- | --- | --- |
| `GET /health` | `{ ok, port, provider, model, hasKey }` | `model` = `modelA` |
| `POST /api/json-mode { prompt }` | 语法闸：`response_format: { type: "json_object" }` | 仅 `type` |
| `POST /api/structured-output { prompt }` | 语义闸：`json_schema` + `strict: true` | `name` + `schema` + `strict: true` |
| `POST /api/strict-rejected` | 故意发坏 schema（缺 `additionalProperties:false` + 含 `anyOf`），**真 strict 会 400** | —— |

### 第六格的特殊价值

`strict-rejected` 测的是网关，不是模型：协议 A 的 strict 对**坏 schema 写法**API 入口就拒（期望 400）。部分国内网关会 silent accept（200 + `unexpectedSuccess: true`）。这是「哪家真做 token-mask、哪家只是软约束」的判别方法。

## §5.3.2 六项

| # | 项 | 在本 Demo 怎么体现 |
| --- | --- | --- |
| 1 | **Happy path** | 5 个预设用例；JSON Mode 页与 Structured 页各跑同一组 prompt |
| 2 | **错误处理**（≥ 2 类） | (a) fetch reject → ErrorBanner；(b) 空 prompt 400 / 没 Key 503 / 上游 4xx·5xx 显式显示；(c) 坏 schema 期望 400 |
| 3 | **Loading 状态** | `#status-pill` = 🔄请求中，按钮 `disabled` |
| 4 | **单会话输出区** | `#output` 按调用追加，最新在顶 |
| 5 | **环境元信息** | `GET /health` + 页脚 `#env-info`（provider / model 禁止写死） |
| 6 | **页面自解释** | `#page-intro` + 控件旁「点了会发生什么」 |

无 Key 时页脚显示 `Key ❌`，各页主按钮直接 disabled。

## 5 个预设用例（与协议 B demo 完全镜像）

| # | 标题 | 触发的事 |
| --- | --- | --- |
| ① | 简单命令 | action=search / query=咖啡 |
| ② | 带 enum 诱导 | action=order；JSON Mode 也守住，但 prompt 加 enum 词越明示越稳 |
| ③ | 故意诱导 schema 违规 | prompt 要 action='unknown' → JSON Mode 看模型守不守；Structured 想 token-mask 住 |
| ④ | 自由发挥字段名 | JSON Mode 可能用 intent/cmd/op 等自由字段名；Structured 强制 action/query |
| ⑤ | 带 qty（optional） | qty 字段在 strict 下也被允许为空 |

外加「⑥ 坏 schema → API 400」独立页。

## 当前能做什么

- 看同一段 prompt 在 JSON Mode vs Structured Output 下输出的差异（`keysSeen` / `missingKeys` / `extraKeys`）
- 看 JSON Mode 输出偶尔夹 markdown fence 或 think 块
- 看 strict 对 schema 写法本身的严格（端点 400 或 unexpectedSuccess）
- 把 5 个用例一键顺序跑，**正面对照** 协议 B Demo（端口 50016）

## 对应学习沉淀

- 文档：[`docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md`](../../../docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md)
- 进度：[模块 04 · Structured Output · 小节进度](../../../docs/学习模块/04-Structured-Output/README.md)

## 没在这里做的事

- 不演示 Anthropic `tool_use` 对照（**协议 B Demo 在隔壁端口 `50016`**）
- 不演示国内各家 strict 支持度差异（要逐 provider 实测）
- 不演示 schema 包含 `anyOf` / `$ref` 时 OpenAI strict 拒收的各路写法坑
- 不演示流式 + structured output 同 prompt
