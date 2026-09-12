# 模块 06 · 03 · Token Budget · step-2 · 双策略对照（trim vs summarize）

> step-2 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50046`

## 跑入口

```bash
cd apps && yarn app:06-03-token-budget-step-2
```

浏览器：[http://127.0.0.1:50046/](http://127.0.0.1:50046/)

## 数据流

```text
浏览器调页面参数（historyCount / outputBudget / totalBudget / summarizeFrom / keepRecent）→ React state
       │
       │  POST /api/compare  { historyCount, outputBudget, totalBudget, summarizeFrom, keepRecent }
       ▼
koa bodyParser → routes/compare.ts Zod 校验
       │
       │  buildMockHistory(historyCount)              ← 第 1 轮 = key fact（自我介绍）
       │  beforeBudget = estimateBudget(...)
       │
       │  trim 路径：
       │    trimToBudget(...)                         ← 丢最旧直到能塞进窗口
       │    messagesTrim = [system, ...trimmed, userText]
       │    ─── 调真模型 #1 ───→ trimReply
       │
       │  summarize 路径：
       │    oldForSummary = history.slice(0, summarizeFrom)
       │    recentOriginal = history.slice(summarizeFrom)
       │    ─── 调真模型（摘要）───→ summary          ← 多 1 次真发网络请求
       │    messagesSummarize = [system, summaryMsg, ...recentOriginal, userText]
       │    若仍超 → 继续丢最近原文直到能塞进窗口
       │    ─── 调真模型 #2 ───→ summarizeReply
       │
       │  KEY_FACT 子串检测：trim.hasKeyFact / summarize.hasKeyFact
       ▼
React 四张卡：① 双策略判定小结  ② trim 路径  ③ summarize 路径（含 summary 内容）  ④ 裁前三块预算
```

服务端日志（`logs/YYYY-MM-DD.log`）每次请求写：handler 入参 → trim（普通函数，日志简写） → summarizeOld（1 次真发网络请求）→ 调真模型 2 次主路径按五条日志写完整 → handler 出参完整 body。

## 当前能做什么

- 五个页面可调参数：history 轮数（2~200）/ output 预留（64~4000）/ 三块合计上限（512~32000）/ summarizeFrom（远期 N）/ keepRecent（近期 K）
- 点「跑对照」→ 服务端算预算 → 走 trim + summarize 两条路径 → 真调 3 次模型（1 次摘要 + 2 次问答）
- 默认参数下：trim 路径 key fact 被丢 → trimReply ❌；summarize 路径 summary 里仍含 → summarizeReply ✅
- 改 `historyCount` 调大 → trimDropped 增多 → trim 路径更惨；summarize 路径受影响小
- 改 `summarizeFrom` 调小（如 5）→ 远期喂摘要的 N 少 → summary 短 → 拼装后预算更容易塞进窗口
- 点「演示后端 5xx」→ 5xx 红字 + #status-pill ❌
- 页脚 `#env-info` 来自 `GET /health`

## step-2 教学点

- **「丢字面 vs 留语义」= trim vs summarize 的核心差异**：同 query 同模型，唯一变量是裁剪策略
- **「trim」= 丢最旧 → key fact 在远期则必丢 → 模型忘**（与 02-step-1 滑动窗口同效果）
- **「summarize」= 远期 N 条 → LLM 浓缩成 1 条 summary → summary 里仍含 key fact → 模型记起**
- **「summarize 的代价」= 多 1 次 LLM 调用**：先调摘要、再调问答；trim 路径只调问答
- **「远期 + 近期」= 生产最常见混合形态**：完整对话太贵，全丢又太狠，摘要是中间地带
- **不在 step-2**：硬阈值应急、选择性注入、软阈值+硬阈值两层、按 token 算窗口、失败兜底降级 —— 这些是 step-N。

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/03-Token-Budget.md](../../../docs/学习模块/06-多轮对话与Context/03-Token-Budget.md)

## 下一步

step-3+ 候选方向（按本节 §6.3 变体覆盖自查清单）：
- step-3：硬阈值应急（超 hardLimit 时只留 system + 最新一轮 + 提示重述）
- step-3：选择性注入（50 段多话题 history + 1 个 query → 只塞相关 N 段）
- step-4：失败兜底降级（summary LLM throw → fallback 到 trim 路径，仍 200）
- step-5：按 token 算窗口（02-step-5 同款对照）
- step-6：50+ 轮真长对话不崩测试（覆盖模块验收）
