# 模块 05 · 02 · Tool Description · step-5 Enum 约束对照

## 跑

```bash
cd apps && yarn app:05-02-description-step-5
```

端口：`50029`（§5.3.3 「max(占用表) + 1」；step-4 = 50028，本条新 demo = 50029）
浏览器：`http://127.0.0.1:50029/`

## 端点

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET    | `/`          | 页面（`public/index.html`） |
| GET    | `/health`    | `{ ok, port, provider, model, hasKey, callsModel:true }` |
| POST   | `/api/compare-baseline` | 真调一次 LLM（协议 A），用「priority=string 无 enum」的 Tool |
| POST   | `/api/compare-improved` | 真调一次 LLM（协议 A），用「priority=string + enum」约束的 Tool |

## 教学点

变体 5 · **Enum / Format 约束**：字段 schema 用 enum 限定取值范围，决定模型是否会幻觉 enum 外的值。
- 单 Tool（query_logistics），去掉 query_order 干扰
- 同 query + 同一 Tool + 唯一差异 = priority 字段是否用 enum 限定 `['low', 'medium', 'high']`
- user query「我的快递 12345 到了吗，比较急」（含"比较急"暗示 priority=high）
- A 组 priority=string 无约束 → 模型可能瞎填「急」「中」「高」（不在 enum 内）
- B 组 priority=string + enum 约束 → 模型必须填 enum 内值（low/medium/high）

## 数据流

```
[user 输入 query]
   │
   ▼
[browser POST /api/compare-baseline { query }]   ← 独立调用 A 组
   │
   ▼
[routes/compare.ts]
   ├─ runOneSide("A 组 priority=string", BASELINE_TOOLS, query)
   │    └─ callProtocolA → 模型返回 tool_call
   │
   ▼
[browser POST /api/compare-improved { query }]   ← 独立调用 B 组
   │
   ▼
[runOneSide("B 组 priority=string + enum", IMPROVED_TOOLS, query) → 同上]
   │
   ▼
[browser 完整差异点表 + 5 档核心对照]
```

## 当前能做什么

- 一次对照：A 组 priority 无 enum / B 组 priority + enum 约束
- query 默认「我的快递 12345 到了吗，比较急」
- 三个示例 query：「比较急」/「不太急」/ 无急缓暗示
- 完整差异点表 9 字段 + 5 档核心对照 + priority 字段 enum 内外检查
- 详细日志写到 `apps/05-Tool-Calling/02-Tool-Description-step-5/logs/{YYYY-MM-DD}.log`

## 对应学习沉淀

`docs/学习模块/05-Tool-Calling/02-Tool-Description.md`（变体 5「Enum / Format 约束」的实证来自本 step）
