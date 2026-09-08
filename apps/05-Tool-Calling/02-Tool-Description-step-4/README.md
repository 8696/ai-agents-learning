# 模块 05 · 02 · Tool Description · step-4 少样示例对照

## 跑

```bash
cd apps && yarn app:05-02-description-step-4
```

端口：`50028`（§5.3.3 「max(占用表) + 1」；step-3 = 50027，本条新 demo = 50028）
浏览器：`http://127.0.0.1:50028/`

## 端点

| Method | Path | 说明 |
| ------ | ---- | ---- |
| GET    | `/`          | 页面（`public/index.html`） |
| GET    | `/health`    | `{ ok, port, provider, model, hasKey, callsModel:true }` |
| POST   | `/api/compare-baseline` | 真调一次 LLM（协议 A），用「描述无 few-shot」的 Tool |
| POST   | `/api/compare-improved` | 真调一次 LLM（协议 A），用「描述含 1 个 few-shot 示例」的 Tool |

## 教学点

变体 4 · **少样示例**：description 写明「user 说这样 → 你这样调」的完整剧本示范，影响模型处理模糊 query 时的填法稳定性。
- 单 Tool（query_logistics），去掉 query_order 干扰
- 同 query + 同一 Tool 描述 + 唯一差异 = description 含不含 1 个 few-shot 示例
- user query「我那个订单到哪了」（模糊 · 无具体 order_id）→ A 组瞎填默认值 / B 组按 example 抽 order_id="12345"
- A 组 description 仍含反例 + 别名映射（跟 step-3 一致），只缺 few-shot

## 数据流

```
[user 输入 query]
   │
   ▼
[browser POST /api/compare-baseline { query }]   ← 独立调用 A 组
   │
   ▼
[routes/compare.ts]
   ├─ runOneSide("A 组 描述无 few-shot", BASELINE_TOOLS, query)
   │    └─ callProtocolA → 模型返回 tool_call / 自然语言
   │
   ▼
[browser POST /api/compare-improved { query }]   ← 独立调用 B 组
   │
   ▼
[runOneSide("B 组 描述含 1 few-shot", IMPROVED_TOOLS, query) → 同上]
   │
   ▼
[browser 完整差异点表 + 5 档核心对照]
```

## 当前能做什么

- 一次对照：A 组无 few-shot / B 组含 1 few-shot（其他都相同）
- query 默认「我那个订单到哪了」（模糊）
- 三个示例 query：模糊（默认）/ 含具体数字 / 改 few-shot 看不同示范
- 完整差异点表 9 字段 + 5 档核心对照
- 详细日志写到 `apps/05-Tool-Calling/02-Tool-Description-step-4/logs/{YYYY-MM-DD}.log`

## 对应学习沉淀

`docs/学习模块/05-Tool-Calling/02-Tool-Description.md`（变体 4「少样示例」的实证来自本 step）
