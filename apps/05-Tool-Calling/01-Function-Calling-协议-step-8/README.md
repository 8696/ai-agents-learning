# 模块 05 · 01 · Function Calling 协议 · step-8 协议 B（Anthropic Messages API · 单协议 B Function Calling）

> 对应小节 MD：[docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md) · 易混点「协议 A vs B」

## 端口

`50024`

## 怎么跑

```bash
cd apps && yarn app:05-01-fc-protocol-step-8
```

浏览器打开 <http://127.0.0.1:50024/>

> **必填环境**：`apps/.env` 当前 provider 必须有 Key，且该 provider 必须支持协议 B（Anthropic Messages API）。缺 Key → 主按钮 disabled + `/api/chat` 返 502。

## 数据流

```
浏览器 → POST /api/chat { input }
  → routes/chat.ts
    → round-1: messages=[user] + tools + max_tokens（必填）
      → callProtocolB(req1) → resp1（content blocks 含 tool_use）
    → execute: toolUsesFromLLM → executeTool() → tool_results
    → round-2: messages=[user, assistant(content blocks), user(content: tool_result blocks)]
      → callProtocolB(req2) → resp2（final_reply = text blocks 拼起来）
  → 返 { user_input, round_1, model_tool_uses, tool_results, round_2, final_reply }
```

## 页面与接口 1:1（§5.3.8）

```
public/
├── index.html              ← 唯一场景页：4 张数据卡（Round 1/2 Request/Response）+ 字段差异对照表
routes/
├── health.ts               ← GET /health（callsModel:true · modelB · maxTokensB）
└── chat.ts                 ← POST /api/chat（协议 B · 两轮）
```

step-8 是单场景 demo（1 个 page + 1 个 route 文件）。

## 本子节教学点

- **协议 B（Anthropic Messages API）字段层物理形态**：同骨架（两轮 Round 1/2 + tool_use → execute → tool_result → final_reply）；不同字段形态
- **4 处关键差异**（与 step-6 协议 A 对照看）：
  - **工具 schema**：协议 A `{type:"function", function:{name,description,parameters}}` vs 协议 B `{name, description, input_schema}`（无 function 包裹）
  - **决定调**：协议 A `tool_calls[i].function.arguments` = **JSON 字符串**（需 JSON.parse）vs 协议 B `content[i].input` = **对象**（直接用，无需解析）
  - **回灌结果**：协议 A `{role:"tool", tool_call_id, content}` vs 协议 B `{role:"user", content:[{type:"tool_result", tool_use_id, content}]}`
  - **必填字段**：协议 A 无 max_tokens vs 协议 B **max_tokens 必填**（忘填 → 400）
- **3 个 Tool**：与 step-6 同（get_weather / search / calc），便于协议 A/B 对照看
- **响应 content blocks 数组**：协议 B `content[]` 是 blocks 数组（text / tool_use / ...），不是协议 A 的 `message.content: string | null`
- **终止原因**：`stop_reason`（协议 B，值集合 `end_turn / max_tokens / tool_use`）vs `finish_reason`（协议 A，值集合 `stop / tool_calls / length / content_filter`）

## 与 step-6 的区别

| 维度 | step-6（协议 A） | step-8（协议 B） |
| --- | --- | --- |
| SDK | `openai` Chat Completions | `@anthropic-ai/sdk` Messages API |
| 工具 schema | `function` 包裹 + `parameters` | 无包裹 + `input_schema` |
| 决定调字段 | `tool_calls[i].function.arguments`（**JSON 字符串**） | `content[i].input`（**对象**） |
| 回灌结果 role | `"tool"` | `"user"` + `tool_result` blocks |
| 必填 | 无 max_tokens | **max_tokens 必填** |
| 终止原因字段 | `finish_reason` | `stop_reason` |
| 响应 content | `message.content: string \| null` | `content[]` blocks 数组 |

## ⚠️ 与 step-6 同页对照（§5.3.13 硬约束）

**本 demo 不做协议 A vs B 同页并排对照**（§5.3.13：默认一份 Demo 只跑一个协议；本条不是"对照"教学点例外）。
- 字段差异对照表在 step-8 页面**静态展示**（对照 step-6 字段手写）
- **协议 A vs B 字段并排真实对照**是模块 02-02 教学点（那里已有 `app:02-02-protocol-ab-step-1` 真 LLM 双协议对照 demo；详 [02-02 MD](../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md)）

## 对应学习沉淀

- MD 易混点 · 协议 A vs B：[易混点节](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)（step-8 反向链接；字段并排详 02-02 MD）
- MD 「协议 A vs B 字段对照表」：概念说明在 05-01 MD；字段并排真实对照在 02-02 MD
- MD 协议层物理形态：[step-2 / step-6 字段说明](../../docs/学习模块/05-Tool-Calling/01-Function-Calling-协议.md)

## 独立性

step-8 是独立协议 B demo（真 LLM）；不复用 step-6 的协议 A 封装；自建 `lib/llm/protocol-b.ts`（Anthropic Messages API 封装）+ 同一组 Tool（get_weather / search / calc）。step-8 的 `lib/`、`routes/` 不被其它 step import（§5.3.12）。