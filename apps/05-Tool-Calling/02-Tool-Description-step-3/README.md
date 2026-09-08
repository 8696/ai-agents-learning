# 模块 05 · 02 · Tool Description · step-3 反例对照

## 跑

```bash
cd apps && yarn app:05-02-description-step-3
```

端口：`50027`（§5.3.3 「max(占用表) + 1」；step-2 = 50026，本条新 demo = 50027）
浏览器：`http://127.0.0.1:50027/`

## 端点

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET    | `/`          | 页面（`public/index.html`） |
| GET    | `/health`    | `{ ok, port, provider, model, hasKey, callsModel:true }` |
| POST   | `/api/compare-baseline` | 真调一次 LLM（协议 A），用「描述无反例」的 Tool |
| POST   | `/api/compare-improved` | 真调一次 LLM（协议 A），用「描述含反例」的 Tool |

## 教学点

变体 3 · **反例**：description 写明「Do not use for X」决定模型能否识别「不该调」的场景。
- 单 Tool（query_logistics），去掉 query_order 干扰
- 同 query + 同一 Tool name + 唯一差异 = description 有没有反例
- user query「我的订单寄到哪个地址」（订单详情类）→ 不该调 query_logistics
- A 组无反例：模型看到「订单」「物流」关键词误以为是物流问题 → 瞎调
- B 组含反例：模型识别为不该调 → 自然语言回应

## 数据流

```
[user 输入 query]
   │
   ▼
[browser POST /api/compare-baseline { query }]   ← 独立调用 A 组
   │
   ▼
[routes/compare.ts]
   ├─ runOneSide("A 组 描述无反例", BASELINE_TOOLS, query)
   │    └─ callProtocolA → 模型返回 tool_call / 自然语言
   │
   ▼
[ctx.body = { label, tools, request, response, pickedToolName, pickedToolArgs, elapsedMs }]
   │
[b ▼
[browser POST /api/compare-improved { query }]   ← 独立调用 B 组（学习者自己点）
   │
   ▼
[runOneSide("B 组 描述含反例", IMPROVED_TOOLS, query) → 同上]
   │
[b ▼
[browser 差异点表 + verdict 判定]
```

## 当前能做什么

- 一次对照：A 组无反例 + B 组含反例
- query 默认「我的订单 12345 寄到哪个地址」（订单详情类，期望两边都不调 query_logistics）
- 完整差异点表 9 字段对照 + 是否识破为不该调（contentMentionsDetect 检测「订单详情/不是物流」等关键词）
- 详细日志写到 `apps/05-Tool-Calling/02-Tool-Description-step-3/logs/{YYYY-MM-DD}.log`

## 对应学习沉淀

`docs/学习模块/05-Tool-Calling/02-Tool-Description.md`（变体 3「反例」的实证来自本 step）
