# 模块 06 · 03 · Token Budget · step-3 · 软阈值+硬阈值两层

> step-3 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50047`

## 跑入口

```bash
cd apps && yarn app:06-03-token-budget-step-3
```

浏览器：[http://127.0.0.1:50047/](http://127.0.0.1:50047/)

## 数据流

```text
浏览器调页面参数（historyCount / outputBudget / totalBudget / hardLimit / strategy / summarizeFrom / keepRecent）→ React state
       │
       │  POST /api/emergency
       ▼
koa bodyParser → routes/emergency.ts Zod 校验（hardLimit ≥ outputBudget+32）
       │
       │  buildMockHistory(historyCount)
       │  estimateBudget(system, history, output) → beforeBudget
       │
       │  mode = beforeBudget.total > hardLimit ? "emergency" : "soft"
       │
       ├─ 先裁或摘要（total ≤ hardLimit）:按 strategy 选 trim 或 summarize
       │     trim:丢最旧非 system 2 条一次,直到 total ≤ totalBudget → 拼装 messages → 调真模型 → softReply
       │     summarize:远期 N 条 → 调 LLM 做 summary + 近期 K 条留原文 → 拼装 messages → 调真模型 → softReply
       │
       └─ 丢掉历史只留 3 条（total > hardLimit）:只保留 system + history 末轮 + 提示"请用一句话重述" → 调真模型 → emergencyReply
       │
       │  返回 { config, beforeBudget, mode, soft?, emergency?, 触发说明 }
       ▼
React 4 张卡：① 触发说明（mode 软写死的判定） ② 先裁或摘要（仅 mode=soft 时显示） ③ 丢掉历史只留 3 条（仅 mode=emergency 时显示） ④ 裁前三块预算
```

服务端日志（`logs/YYYY-MM-DD.log`）每次请求写：handler 入参（含 6 个页面可调参数 + modelA + beforeBudget）→ 调真模型主路径按五条日志写完整（先裁或摘要 / 丢掉历史只留 3 条各一份）→ handler 出参含 mode + 完整 body。

## 当前能做什么

- **6 个页面可调参数**:history 轮数(2~200) / output 预留(64~4000) / 软阈值 totalBudget(512~32000) / 硬阈值 hardLimit(256~16000) / 先裁或摘要策略(trim / summarize) / summarize 相关页面参数
- **三档自动判定**:
  - total ≤ hardLimit → 先裁或摘要(走 trim 或 summarize)
  - total > hardLimit → 丢掉历史只留 3 条(只留 3 条保服务)
  - hardLimit < outputBudget+32 → 4xx 拒绝(hardLimit 必须给 output 留够空间)
- 默认参数(50 轮 / outputBudget=800 / totalBudget=2000 / hardLimit=1000) → total=3129 > 1000 → **默认就触发丢掉历史只留 3 条**(这是预期:默认展示只留 3 条保服务)
- 调 totalBudget=8000 / hardLimit=4000 → 3129 < 4000 → 先裁或摘要 trim(不裁)
- 调 historyCount=200 → total 远超 hardLimit → 丢掉历史只留 3 条,messages 只剩 3 条(应急)
- 点「演示后端 5xx」→ 5xx 红字 + #status-pill ❌
- 页脚 `#env-info` 来自 `GET /health`(provider / model / hasKey)

## step-3 教学点

- **「软阈值 + 硬阈值」双层兜底**:软阈值(totalBudget / step-1~2 的 trim / summarize)能救就救;裁或摘要后仍超限时,硬阈值(hardLimit)直接砍到 system + history 末轮 + 提示"请用一句话重述"
- **「保证服务永远在能发请求状态」**:不会因为历史太长而 400 / 静默截断 / 崩溃——这是硬阈值的设计目的
- **「应急 messages 只剩 3 条」**:system + history 末轮(原 user 或 assistant)+ user 提示("对话太长,请用一句话重新描述")——极度经济,永远能塞进 context
- **「硬阈值 < outputBudget + 32」**:Zod 校验拒绝这种"硬阈值不够给输出留空间"的配置(给 output 留够空间,再小就要么超窗口要么没输出)
- **不在 step-3**:选择性注入(只塞相关 history)、按 token 算窗口、失败兜底降级 —— 这些是 step-N 候选

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/03-Token-Budget.md](../../../docs/学习模块/06-多轮对话与Context/03-Token-Budget.md)

## 下一步

step-N 由学习者主动决定何时加(§5.3.14)。候选方向:
- step-4:选择性注入(50 段多话题 history + 1 个 query → 关键词匹配只塞相关 N 段,对比"全塞 vs 选择性")
- step-5:按 token 算窗口变体(滑动窗口 K 从"条数"换成"token 数",对照 02 step-5)
- step-6:失败兜底降级(摘要 LLM throw → fallback trim,对照 02 step-4)
