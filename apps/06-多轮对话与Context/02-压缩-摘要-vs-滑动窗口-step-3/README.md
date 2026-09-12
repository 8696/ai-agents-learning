# 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-3 双策略并跑 · 三方对照

> step-3 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50042`

## 跑入口

```bash
cd apps && yarn app:06-02-compress-vs-window-step-3
```

浏览器：[http://127.0.0.1:50042/](http://127.0.0.1:50042/)

## 数据流

```text
浏览器调 5 个页面可调参数（turnCount / slidingWindowSize / summarizeFrom / keepRecent / keyFactAtTurn）
       │
       │  POST /api/three-way
       ▼
koa bodyParser → routes/three-way.ts Zod 校验
       │
       │  buildMockHistory(turnCount, keyFactAtTurn)  ← 同 step-1/2
       │
       │  messagesFull = [system, ...mockHistory, 问句]                              ← ① 完整
       │  messagesSliding = slidingWindowTrim(messagesFull, slidingWindowSize)      ← ② 滑动窗口（system pin + 留最近 K 条）
       │  oldForSummary = mockHistory.slice(0, summarizeFrom)
       │    ──── 调真模型（摘要）────→ summary                                       ← 调 LLM 摘要远期 N 条
       │  recentOriginal = mockHistory.slice(summarizeFrom)
       │  messagesSummarize = [system, summary_message, ...recentOriginal, 问句]    ← ③ 摘要压缩（远期 summary + 近期原文）
       │
       │  依次调真模型 3 次：
       │    ──── 调真模型 #1（完整）────→ fullReply
       │    ──── 调真模型 #2（滑动窗口）→ slidingReply
       │    ──── 调真模型 #3（摘要压缩）→ summarizeReply
       │
       │  返回 { full, sliding, summarize } 三份对照
       ▼
React 5 张卡：① 完整（fullReply） ② 滑动窗口（slidingReply） ③ 摘要压缩（summarizeReply） ④ summary 内容 ⑤ 三方对比小结
```

服务端日志（`logs/YYYY-MM-DD.log`）每次请求写：入参 → 摘要主路径按五条日志写完整 → 三次问答主路径按五条日志写完整 → handler 结束含三方判定。

## 当前能做什么

- 五个页面可调参数：假对话轮数 / 滑动窗口 K / 待摘要条数 / 保留近期 / key fact 放第几轮
- 点「跑三方对照」→ 服务端调 4 次真模型 → 5 张卡片
- 默认参数（50/6/45/5/1）下：full ✅ / sliding ❌ / summarize ✅ → 标准结果「丢字面 vs 留语义」
- 卡 ④ summary 内容单独展示，看 LLM 把远期 N 条浓缩成啥
- 改 `keyFactAtTurn` = 49 → 三方都记得（key fact 在窗口内 + summary 里）
- 改 `slidingWindowSize` = 50 → sliding 也记得（窗口够大）
- 改 `keepRecent` = 0 极端摘要态：summarize 也记得（summary 里写了 key fact）
- 点「演示后端 5xx」→ 5xx 红字 + #status-pill ❌

## step-3 教学点

- **「三方对照」= 同一问句同一模型，唯一变量是 messages 的裁剪策略**——这是证明「滑动窗口 vs 摘要压缩」差别的最直接证据
- **「丢字面 vs 留语义」**：滑动窗口 K=6 时 slidingReply 忘 key fact（字面丢失）；摘要压缩 summarizeReply 记得 key fact（语义保留）
- **「代价对比」**：① 完整 = 0 裁剪但 messages 长；② 滑动窗口 = 0 额外调用；③ 摘要压缩 = 1 次额外 LLM 调用 ≈ 1~3s
- **「控制 token 成本」**：不压 → token 数随对话长度线性涨；压 → 有上限
- **不在 step-3**：摘要失败兜底降级、按 token 算窗口、增量摘要 vs 分段摘要、双策略自动切换（按阈值）。这些进 step-N。

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md](../../../docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md)

## 下一步

学习者主动锁定 step-3 后 → 双方决定 step-4 加什么（按 §5.3.14）：

- **step-4 候选**：失败兜底降级（覆盖需求 5）—— 模拟摘要 LLM 超时 → 自动降级到滑动窗口，日志打「摘要失败，降级为滑动窗口」
- **step-5 候选**：按 token 算窗口（变体 2）—— 把 slidingWindowSize / summarizeFrom 换成 token budget；触发条件从条数 → token 数
- **step-6 候选**：双策略自动切换（按阈值触发哪种策略）—— 当 token > 阈值时跑摘要；摘要失败降级到滑动
