# 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-2 摘要压缩（远期摘要 + 近期原文）

> step-2 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50041`

## 跑入口

```bash
cd apps && yarn app:06-02-compress-vs-window-step-2
```

浏览器：[http://127.0.0.1:50041/](http://127.0.0.1:50041/)

## 数据流

```text
浏览器调旋钮（turnCount / summarizeFrom / keepRecent / keyFactAtTurn）→ React state
       │
       │  POST /api/summarize  { turnCount, summarizeFrom, keepRecent, keyFactAtTurn }
       ▼
koa bodyParser → routes/summarize.ts Zod 闸门（summarizeFrom + keepRecent ≤ turnCount）
       │
       │  buildMockHistory(turnCount, keyFactAtTurn)  ← 同 step-1
       │
       │  messagesBefore = [system, ...mockHistory, 问句]
       │    ─── 调真模型 #1（before · 基线）───→ beforeReply
       │
       │  oldForSummary = mockHistory.slice(0, summarizeFrom)
       │    ─── 调真模型 #2（摘要）───→ summary（300 字以内浓缩 + 强调保留用户事实）
       │
       │  recentOriginal = mockHistory.slice(summarizeFrom)
       │
       │  messagesAfter = [system,
       │                    {role:'assistant', content:'【历史对话摘要】\n' + summary},
       │                    ...recentOriginal,
       │                    问句]
       │    ─── 调真模型 #3（after · 验证）───→ summarizeReply
       │
       │  返回 { messagesBefore, summary, summaryMessages, recentOriginal, messagesAfter, beforeReply, summarizeReply, ... }
       ▼
React 四张卡：① 裁剪前（messages + beforeReply） ② summary 内容（LLM 写的文本） ③ 摘要后（messages + summarizeReply） ④ 对比小结
```

服务端日志（`logs/YYYY-MM-DD.log`）每次请求打：入参 → before 核心档五件套 → 摘要核心档五件套 → after 核心档五件套 → handler 结束含 `summaryHasKeyFact/summarizeReplyHasKeyFact` 判定。

## 当前能做什么

- 四个旋钮：假对话轮数（2~80）、待摘要条数（1~turnCount）、保留近期（0~turnCount-1）、key fact 放第几轮（1~turnCount）
- 点「跑摘要压缩对照」→ 服务端调 3 次真模型 → 四张卡片
- 默认参数（50/45/5/1）下：before 记得 key fact、summary 里也写 key fact、摘要后也记得 → 一眼看见「摘要压缩保留了什么」
- 卡 ② summary 内容单独展示，让学习者**直接看到** LLM 把远期 N 条浓缩出来的文本
- 对照 step-1：step-1 滑动窗口 K=6 时 afterReply 忘 key fact；step-2 摘要压缩 summarizeReply 记得 key fact
- 点「演示上游失败」→ 5xx 红字 + #status-pill ❌
- 页脚 `#env-info` 来自 `GET /health`（provider / model / hasKey）

## step-2 教学点

- **「摘要压缩」= 调 LLM 把旧 N 条浓缩成 1 条 summary**：不是丢字，是重写
- **「保留语义、丢细节」**：summary 里会出现「用户 Tina 住上海 喜日料」，但「sushi 店招牌 omakase」会变成「聊过日料店」
- **「代价」= 1 次额外 LLM 调用 ≈ 500ms~3s**：与滑动窗口的 0 代价对照
- **「远期摘要 + 近期原文」= 生产最常见混合形态**：K=0 = 极端摘要态（全摘要 + 0 原文）；K=N = 极端滑动态（全原文 + 0 摘要）；K=5 = 教学默认（平衡）
- **不在 step-2**：摘要失败兜底降级、双策略并跑三方对比、按 token 算窗口、增量摘要 vs 分段摘要。这些进 step-N。

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md](../../../docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md)

## 下一步

step-3（学习者已确认进）。建议方向：双策略并跑 · 三方对照（覆盖需求 4）—— 一次跑 ① 完整 / ② 滑动窗口 / ③ 摘要压缩 → 一张三卡对照 + JSON diff。
