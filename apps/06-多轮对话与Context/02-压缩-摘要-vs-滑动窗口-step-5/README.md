# 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-5 按 token 算窗口（变体 2）

> step-5 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50044`

## 跑入口

```bash
cd apps && yarn app:06-02-compress-vs-window-step-5
```

浏览器：[http://127.0.0.1:50044/](http://127.0.0.1:50044/)

## 数据流

```text
浏览器调 5 个页面可调参数（turnCount / slidingTokenBudget / summarizeTokenBudget / keepRecent / keyFactAtTurn）
       │
       │  POST /api/token-budget
       ▼
koa bodyParser → Zod 校验
       │
       │  buildMockHistory + encode 每条 token 数（gpt-tokenizer）
       │
       │  messagesFull = [system, ...mockHistory, 问句]                                   ← ① 完整
       │  messagesSliding = tokenWindowTrim(messagesFull, slidingTokenBudget)            ← ② 滑动窗口（按 token）
       │    ── 从最新往旧累加 token，累加到 ≤ budget 为止；system pin
       │  oldForSummary + recentOriginal（按 slidingBoundary 切分）
       │    ──── 调真模型（摘要）────→ summary                                           ← 调 LLM 摘要远期
       │  messagesSummarize = [system, summary_message, ...recentOriginal, 问句]          ← ③ 摘要压缩
       │
       │  依次调真模型 3 次：
       │    ──── 调真模型 #1（完整）────→ fullReply
       │    ──── 调真模型 #2（滑动窗口按 token）→ slidingReply
       │    ──── 调真模型 #3（摘要压缩）→ summarizeReply
       │
       │  返回 { full, sliding, summarize, tokenReport }
       ▼
React 5 张卡：① 完整 ② 滑动窗口（按 token） ③ 摘要压缩 ④ summary 内容 ⑤ 「按 token vs 按条数」对照
```

## 当前能做什么

- 5 个页面可调参数：假对话轮数 / 滑动窗口 token B / 摘要触发阈值 / 保留近期 / key fact 放第几轮
- 点「跑按 token 对照」→ 服务端算 token + 调 4 次真模型 → 5 张卡片
- 默认参数（50/500/5000/5/1）下：full ✅ / sliding ❌ / summarize ✅ → 「按 token 滑动窗口也丢 key fact」（远期超预算）
- 改 `slidingTokenBudget` = 10000 → 预算够大，sliding 也记得 key fact
- 卡 ⑤ 「按 token vs 按条数」对照：解释变体 2 的核心价值
- 点「演示后端 5xx」→ 5xx 红字

## step-5 教学点（变体 2）

- **「按 token」vs「按条数」= 单条超长消息时的关键差异**
- **「按 token 算窗口」= 从最新往旧累加 token，累加到 ≤ budget 为止；system pin**
- **「按 token 触发摘要」= 远期 token 累计 > 阈值才摘要**
- **「token 预算」= 生产里最稳的硬上限控制方式（不依赖消息长度）**
- **生产建议**：用「按 token」做硬上限 + 「按条数」做辅助 = 「token 预算 + 最小条数」双重限制

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md](../../../docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md)

## 下一步

学习者主动锁定 step-5 后 → 5 个 step 全部已落 + 锁定 → `coach complete` 过关检查 1→2→3 全过 → 勾 ✅ 本条。
