# 模块 05 · 02 · Tool Description · step-1 对照实验

## 跑

```bash
cd apps && yarn app:05-02-description-step-1
```

端口：`50025`（§5.3.3 「max(占用表) + 1」；占用表当前最大 50024，本条新 demo = 50025）
浏览器：`http://127.0.0.1:50025/`

## 端点

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET    | `/`          | 页面（`public/index.html`） |
| GET    | `/health`    | `{ ok, port, provider, model, hasKey, callsModel:true }` |
| POST   | `/api/compare` | 真调两次 LLM（协议 A），对比模型在「差描述 / 好描述」两套 Tool 下的选择 |

## 教学点

变体 1 · **触发条件**：description 写明「何时调 / 何时别调」决定模型选择。
- 同 query + 同模型 + 不同的 description = 不同的 tool_call
- A 组描述太短/没反例：模型随机选；B 组描述带触发条件 + 反例：模型稳定选对
- 字段级 `description`（order_id = 「用户的订单号，如 '12345'」）也影响模型怎么填参数

## 数据流

```
[user 输入 query]
   │
   ▼
[browser POST /api/compare { query }]
   │
   ▼
[routes/compare.ts]
   ├─ runOneSide("差描述", baselineTools, query)
   │    └─ callProtocolA → 模型返回 tool_call(name="query_order|query_logistics|...")
   │
   └─ runOneSide("好描述", improvedTools, query)
        └─ callProtocolA → 模型返回 tool_call
   │
   ▼
[ctx.body = { query, expected_tool, baseline, improved, verdict }]
   │
   ▼
[browser 左右两张 SideCard 对照 + verdict 判定]
```

## 当前能做什么

- 一次对照实验：同一 query 调两次模型（差描述 vs 好描述），看工具选择差异
- verdict 判定哪一侧「调对 / 调错」，并给一段人话说明
- 三个示例 query 按钮：A 物流类、B 地址类、C 无关天气（用于观察差描述侧是否更易错调）
- 详细日志写到 `apps/05-Tool-Calling/02-Tool-Description-step-1/logs/{YYYY-MM-DD}.log`

## 对应学习沉淀

`docs/学习模块/05-Tool-Calling/02-Tool-Description.md`（变体 1 触发条件的实证来自本 step）
