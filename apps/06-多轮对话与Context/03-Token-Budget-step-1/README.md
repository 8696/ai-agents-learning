# 模块 06 · 03 · Token Budget · step-1 · 三块分账 + 拼装前打印 + 超预算裁最旧

> step-1 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。
>
> **这一步只做了一件事**：公式 `total = system + history + output 预留`，超了 `totalBudget` 就丢最旧非 system 消息。**system / output 预留都不动**。摘要压缩、选择性注入、硬阈值、软硬双层都**不**在 step-1 — 留给 step-2+。

## 端口

`50045`

## 跑入口

```bash
cd apps && yarn app:06-03-token-budget-step-1
```

浏览器：[http://127.0.0.1:50045/](http://127.0.0.1:50045/)

## 数据流

```text
浏览器调旋钮（historyCount / outputBudget / totalBudget）→ React state
       │
       │  POST /api/budget  { historyCount, outputBudget, totalBudget }
       ▼
koa bodyParser → routes/budget.ts Zod 闸门
       │
       │  buildMockHistory(historyCount)              ← 生成 N 轮假 user/assistant 闲聊
       │
       │  estimateBudget(systemText, history, outputBudget)
       │    → beforeBudget = { systemTokens, historyTokens, outputBudget, total }
       │
       │  trimToBudget(history, systemText, outputBudget, totalBudget)
       │    → total > totalBudget → 从最旧丢（按 user/assistant 对丢，2 条一次）
       │    → afterBudget = { systemTokens, historyTokens', outputBudget, total' }
       │
       │  messages = [system, ...trimmed, userText]
       │    ─── 调真模型 ───→ reply
       │
       │  返回 { beforeBudget, afterBudget, dropped, triggered, messages, reply, replyTokens, 触发说明 }
       ▼
React 四张卡：① 触发说明  ② 三块预算裁前/裁后  ③ 实际发给模型的 messages  ④ 模型回答 + 实际 output token
```

服务端日志（`logs/YYYY-MM-DD.log`）每次请求打：handler 入参（含 systemText/historyCount/outputBudget/totalBudget/modelA）→ trimToBudget 入参/出参（裁前/裁后预算 + dropped）→ 调真模型核心档五件套（入参完整 messages + 返回值完整 completion）→ handler 出参完整 body。

## 当前能做什么

- 三个旋钮：history 轮数（0~200）/ output 预留（64~4000 token）/ 三块合计上限（512~32000 token）
- 点「跑预算」→ 服务端算 system + history + output 三块 token → 超了就丢最旧 → 真调一次模型
- 默认参数（history=50/outputBudget=800/totalBudget=2000）下大概率触发裁剪：看 `dropped` 和 `触发说明`
- 改 `totalBudget` 调大（如 8000）→ 不触发裁剪 → 整段 history 全留
- 改 `historyCount` 调小（如 10）→ history 段 token 变小 → 不触发裁剪
- 改 `historyCount` 调大（如 200）→ dropped 数字增大 → 看裁剪上限兜底
- 点「演示上游失败」→ 5xx 红字 + #status-pill ❌
- 页脚 `#env-info` 来自 `GET /health`（provider / model / hasKey）

## step-1 教学点

- **公式**：`total = system + history + output 预留`；`total > totalBudget` → 丢最旧非 system 消息（按 user/assistant 对丢），保留 output/system
- **「Token Budget」= 在拼 messages 之前先算账**：system / history / output 三块各自占多少、合计超没超上限
- **「拼装前打印 token」**：在 `messages = [...]` 之前算 total，超了先裁（不是发完等 400 报错）
- **「output 预留不能事后裁」**：只能拼装前预留；模型用了多少看 `replyTokens` vs `outputBudget`
- **step-1 只演示"丢最旧"这一种策略**：摘要压缩 / 选择性注入 / 硬阈值 / 软硬双层都不在 step-1 — 留给 step-N
- **不在 step-1**：硬阈值应急（只留 system + 最新一轮）、摘要压缩、选择性注入、软阈值/硬阈值双层 —— 这些是 step-N。

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/03-Token-Budget.md](../../../docs/学习模块/06-多轮对话与Context/03-Token-Budget.md)

## 下一步

step-N 由学习者主动决定何时加（§5.3.14）。候选方向（按本节 §6.3 变体覆盖自查清单）：
- step-2：硬阈值应急（total > hardLimit 时只留 system + 最新一轮 + 提示用户重述）
- step-3：摘要压缩（超出阈值时调 LLM 把远期 history 浓缩成 1 条 summary）
- step-4：选择性注入（50 段多话题 history + 1 个 query → 只塞相关 N 段）
- step-5：混合策略（远期摘要 + 近期原文 + 当前 user）
- step-6：50+ 轮超长对话不崩测试（覆盖模块验收「50+ 轮不崩」）
