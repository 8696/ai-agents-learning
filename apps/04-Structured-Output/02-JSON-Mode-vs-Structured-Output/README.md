# 04 · Structured Output · 02 协议 A 版 · JSON Mode vs Structured Output

**协议 A（OpenAI Chat Completions）** 视角下的"结构化输出"对照 Demo — §5.3 完整版（前后端，浏览器可视化）。

是 [`02-JSON-Mode-vs-Tool-Use-ProtoB/`](../02-JSON-Mode-vs-Tool-Use-ProtoB/README.md) **协议 B 版的镜像**：同一组 5 个诱导用例、同一组分析维度，用 **OpenAI SDK** 走一遍，并排对照两条协议的"API 表面 + 闸的位置 + 模型守约"。

## 怎么跑

需要 `.env` 里有协议 A 的 key（按 `LLM_PROVIDER` 配置；多数国内网关同时支持协议 A 和 B 两套端口）。

```bash
cd apps
yarn app:04-02-json-mode-vs-structured-output
```

启动后打开 <http://127.0.0.1:50402/>。

## 端口

`50402` —— 公式 `5{模块两位}{小节两位}` = `5` + `04` + `02`。
可用 `PORT=` 单次覆盖。

## API 表面 · 协议 A vs B 一图看清

| 维度 | 协议 A · OpenAI Chat Completions | 协议 B · Anthropic Messages API |
| --- | --- | --- |
| **闸的字段名** | `response_format` | `tools[].input_schema` + `tool_choice` |
| **JSON Mode** | `response_format: { type: "json_object" }` | **没有等价字段** |
| **Structured Output** | `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }` | `tools: [{ name, description, input_schema }]` + `tool_choice: { type: "tool", name }` |
| **闸的实现机制** | strict 时真 token-mask；不 strict 时软约束 | input_schema 倾向让模型守；tool_choice 强制调函数；没有 token-mask |
| **写在哪** | 模型吐在 `choices[0].message.content`（字符串，要 JSON.parse） | 模型吐在 `content[type="tool_use"].input`（已是解析好的对象，无须 parse） |
| **schema 写法严格度** | strict 强制白名单：禁止 `anyOf` / 必须 `additionalProperties:false` / 必列 `required` | 宽松得多：接受 `anyOf` / `$defs`；推荐 `description` |

**核心结论**：协议 A 的"语义闸"是 `response_format.strict: true` 一个字段物理层；协议 B 是 input_schema + tool_choice 两字段软约束。**两边都不是完美硬闸——都要在服务端用 Zod 做最后一道兜底。**

## 四个端点

| 端点 | 做什么 | 关键字段 |
| --- | --- | --- |
| `GET /health` | `{ ok, port, model, provider, hasKey }` | 协议 A 模式（无 `protocol` 字段，下方就是协议 B 的 demo） |
| `POST /api/json-mode { prompt }` | 语法闸：`response_format: { type: "json_object" }` | 仅 `type` |
| `POST /api/structured-output { prompt }` | 语义闸：`response_format: { type: "json_schema", json_schema: {...}, strict: true }` | `name` + `schema` + `strict: true` |
| `POST /api/strict-rejected` | 故意发坏 schema（缺 `additionalProperties:false` + 含 `anyOf`），**OpenAI 真 strict 会 400** | —— |

### 第六格的特殊价值

⑥ `strict-rejected` 是这次最有诊断意义的一格：协议 A 的 strict 模式对**坏 schema 写法**API 入口就拒（期望 400）。**但 MiniMax-M3 实测 silent accept**——直接 200 + `unexpectedSuccess: true`。这是协议 A 路径下"哪家 provider 真做 token-mask"和"哪家只是软约束"的判别方法。详见本 demo §5.2 Demo 判断块 §踩坑。

## §5.3.2 四项

| # | 项 | 在本 Demo 怎么体现 |
| --- | --- | --- |
| 1 | **Happy path** | 5 个预设用例一键跑，每一对左右并排对比 JSON Mode vs Structured Output |
| 2 | **错误处理**（≥ 2 类） | (a) 没 Key 时 `#status-pill` 红 / 端点 503；(b) strict schema 拒收时端点 400 + OpenAI 报错原文显示；(c) `JSON.parse` 失败（夹 `<think>` 或夹 fence）时 raw 旁标红 + 服务端 issues 列表 |
| 3 | **Loading 状态** | `#status-pill` = 🔄请求中，按钮 disabled |
| 4 | **单会话输出区** | `#output` 区按调用追加显示，最新用例在顶 |

## 5 个预设用例（与协议 B demo 完全镜像）

| # | 标题 | 触发的事 |
| --- | --- | --- |
| ① | 简单命令 | action=search / query=咖啡 |
| ② | 带 enum 诱导 | action=order；JSON Mode 也守住，但 prompt 加 enum 词越明示越稳 |
| ③ | 故意诱导 schema 违规 | prompt 要 action='unknown' → JSON Mode 看模型守不守；Structured 想 token-mask 住 |
| ④ | 自由发挥字段名 | JSON Mode 可能用 intent/cmd/op 等自由字段名；Structured 强制 action/query |
| ⑤ | 带 qty（optional） | qty 字段在 strict 下也被允许为空 |

外加「⑥ strict schema 写法不对 → API 400」独立按钮——故意发违反 OpenAI strict 写法规则的 schema，看 API 入口直接 400。

## 当前能做什么

- 看同一段 prompt 在 JSON Mode vs Structured Output 下输出的差异（`keysSeen` / `missingKeys` / `extraKeys`）
- 看 JSON Mode 输出偶尔夹 `` ``` json ... ``` `` markdown fence
- 看 strict 模式对 schema 写法本身的严格（`#status-pill` 红 / 端点 400）
- 把 5 个用例一键顺序跑，**正面对照** 协议 B Demo（端口 50412）

## 对应学习沉淀

- 文档：[`docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md`](../../docs/学习模块/04-Structured-Output/02-JSON-Mode-vs-Structured-Output.md)
- 进度：[模块 04 · Structured Output · 小节进度](../../docs/学习模块/04-Structured-Output/README.md#小节进度)

## 没在这里做的事

- 不演示 Anthropic `tool_use` 对照（**协议 B Demo 在隔壁端口 `50412`**，同样的 5 用例 + ⑥）
- 不演示国内各家 strict 支持度差异（要逐 provider 实测，单条条目承载不下）
- 不演示 schema 包含 `anyOf` / `$ref` 时 OpenAI strict 拒收的各路写法坑（OpenAI strict 真拒绝 + Anthropic 接受，是"协议差异"本身的实证）
- 不演示流式 + structured output 同 prompt（下一条「模块复盘」或后续 Agent Loop 条目再说）
