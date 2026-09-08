# 模块 05 · 02 · Tool Description · step-6 跨 Provider 兼容

## 跑

```bash
cd apps && yarn app:05-02-description-step-6
```

端口：`50030`（§5.3.3 「max(占用表) + 1」；step-5 = 50029，本条新 demo = 50030）
浏览器：`http://127.0.0.1:50030/`

## 端点

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET    | `/`          | 页面（`public/index.html`） |
| GET    | `/health`    | `{ ok, port, provider, model, hasKey, callsModel:true }` |
| POST   | `/api/compare-baseline` | 真调一次 LLM（**协议 A · OpenAI**），用同一份 Tool schema（step-5 B 组含反例+别名+enum） |
| POST   | `/api/compare-improved` | 真调一次 LLM（**协议 B · Anthropic**），用**同一份** Tool schema |

## 教学点

变体 6 · **跨 Provider 兼容**：同一份 Tool schema（已含 step-3 反例 + step-2 别名映射 + step-5 enum 综合最优）在 OpenAI 协议 A 和 Anthropic 协议 B 两家 Provider 都能跑通。
- **两侧用同一份 Tool schema**（不是「好 vs 差」对照）—— 控制变量是 Provider（OpenAI vs Anthropic）
- A 组 endpoint 走 `openai.chat.completions` SDK + 协议 A `tools` 格式
- B 组 endpoint 走 `anthropic.messages` SDK + 协议 B `tools` 格式（自动翻译 schema 形状 + 解析 `tool_use` block）
- 验证「step-1~5 学到的所有写法」跨 Provider 可迁移

## 数据流

```
[user 输入 query]
   │
   ▼
[browser POST /api/compare-baseline { query }]   ← A 组 · 协议 A · OpenAI 调
   │
   ▼
[routes/compare.ts]
   ├─ runOneSide("协议 A · OpenAI", TOOLS, query)
   │    └─ callProtocolA(req) → tool_call
   │
[browser POST /api/compare-improved { query }]  ← B 组 · 协议 B · Anthropic 调
   │
   ▼
[runAnthropicSide("协议 B · Anthropic", TOOLS, query)
   ├─ openAIToAnthropicSchema(TOOLS) → 协议 B tools 形状
   ├─ callProtocolB(req) → tool_use block
   └─ 解析 tool_use → pickedToolName + pickedToolArgs
   │
   ▼
[browser 完整差异点表（focus_protocol 字段）]
```

## 当前能做什么

- 一次对照：A 组 OpenAI / B 组 Anthropic（同一份 schema）
- query 默认「我的快递 12345 到了吗」（物流类 + 给具体 order_id + 无急缓暗示）
- 完整差异点表 9 字段 + 5 档核心对照 + **provider 字段**（OpenAI 或 Anthropic）
- 详细日志写到 `apps/05-Tool-Calling/02-Tool-Description-step-6/logs/{YYYY-MM-DD}.log`

## 对应学习沉淀

`docs/学习模块/05-Tool-Calling/02-Tool-Description.md`（变体 6「跨 Provider 兼容」的实证来自本 step）
