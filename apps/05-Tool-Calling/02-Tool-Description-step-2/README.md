# 模块 05 · 02 · Tool Description · step-2 字段 description 对照

## 跑

```bash
cd apps && yarn app:05-02-description-step-2
```

端口：`50026`（§5.3.3 「max(占用表) + 1」；step-1 = 50025，本条新 demo = 50026）
浏览器：`http://127.0.0.1:50026/`

## 端点

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET    | `/`          | 页面（`public/index.html`） |
| GET    | `/health`    | `{ ok, port, provider, model, hasKey, callsModel:true }` |
| POST   | `/api/compare` | 真调两次 LLM（协议 A），对比模型在「字段无 description / 字段有 description」下 order_id 的填法 |

## 教学点

变体 2 · **参数语义**：字段 description 写明「字段是什么 / 不接受什么」决定模型填参数的稳定性。
- 单 Tool（query_logistics）去掉 query_order 干扰
- 同 query + 同一 Tool description + 唯一差异 = order_id 字段有无 description
- 字段 description 写明「不接受城市名等非订单号输入」→ 模型没瞎填
- 字段无 description → 模型把「北京」当订单号瞎填

## 数据流

```
[user 输入 query]
   │
   ▼
[browser POST /api/compare { query }]
   │
   ▼
[routes/compare.ts]
   ├─ runOneSide("A 组 字段无 desc", BASELINE_TOOLS, query)
   │    └─ callProtocolA → 模型返回 tool_call(name="query_logistics", arguments={order_id: ...})
   │
   └─ runOneSide("B 组 字段有 desc", IMPROVED_TOOLS, query)
        └─ callProtocolA → 模型返回 tool_call(name="query_logistics", arguments={order_id: ...})
   │
   ▼
[verdict：isBadCityArg 比较两侧 pickedArgs.order_id 是否瞎填城市名]
   │
   ▼
[browser 左右两张 SideCard + verdict 判定]
```

## 当前能做什么

- 一次对照实验：同 query 调两次模型（A 组字段无 description / B 组字段有 description「不接受城市名」），看 order_id 参数填法
- 三种 query：城市名当订单号 / 另一个城市 / 不给订单号
- 详细日志写到 `apps/05-Tool-Calling/02-Tool-Description-step-2/logs/{YYYY-MM-DD}.log`

## 对应学习沉淀

`docs/学习模块/05-Tool-Calling/02-Tool-Description.md`（变体 2「参数语义」的实证来自本 step）
