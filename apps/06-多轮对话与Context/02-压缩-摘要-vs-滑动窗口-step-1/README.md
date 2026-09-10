# 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-1 滑动窗口（按条数 + system pin）

> step-1 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50040`

## 跑入口

```bash
cd apps && yarn app:06-02-compress-vs-window-step-1
```

浏览器：[http://127.0.0.1:50040/](http://127.0.0.1:50040/)

## 数据流

```text
浏览器调页面参数（turnCount / windowSize / keyFactAtTurn）→ React state
       │
       │  POST /api/compare  { turnCount, windowSize, keyFactAtTurn }
       ▼
koa bodyParser → routes/compare.ts Zod 校验
       │
       │  buildMockHistory(turnCount, keyFactAtTurn)
       │    → 第 keyFactAtTurn 轮 user 说「我叫 Tina 住上海 爱日料」 + assistant 回应
       │    → 其余 (turnCount-1) 轮 user/assistant 闲聊
       │
       │  messagesBefore = [system, ...mockHistory, {role:'user', content:'你还记得吗？'}]
       │    ─── 调真模型 #1 ───→ beforeReply
       │
       │  slidingWindowTrim(messagesBefore, windowSize)  ← system pin + 留最近 K 条非 system
       │    ─── 调真模型 #2 ───→ afterReply
       │
       │  返回 { messagesBefore, messagesAfter, beforeReply, afterReply, keyFactInBefore, keyFactInAfter, dropped, ... }
       ▼
React 三张卡：① 裁剪前（messages + beforeReply） ② 裁剪后（messages + afterReply） ③ 对比小结（key fact 在 / 不在）
```

服务端日志（`logs/YYYY-MM-DD.log`）每次请求写：入参 → 滑动窗口普通函数按五条日志写完整 → 两次模型调用主路径按五条日志写完整 → handler 结束含 `keyFactInBefore/After` 判定 + 总耗时。

## 当前能做什么

- 三个页面可调参数：假对话轮数（2~80）、滑动窗口 K（2~20）、key fact 放第几轮（1~当前 turnCount）
- 点「跑对比」→ 服务端跑 50 轮假历史 + 调两次真模型 → 三张卡片对照
- 默认参数（50/6/1）下：before 记得 key fact；after 忘掉 key fact → 一眼看见「滑动窗口丢了什么」
- 改 `keyFactAtTurn` = 49 → key fact 在窗口内 → 两边都记得 → 反向印证
- 改 `windowSize` = 50 → 不丢任何东西 → 两边都记得
- 点「演示上游失败」→ 5xx 红字 + #status-pill ❌
- 页脚 `#env-info` 来自 `GET /health`（provider / model / hasKey）

## step-1 教学点

- **「滑动窗口」= 按条数 K 截断 + system 永远 pin**：丢掉最老的非 system 消息，保留最近 K 条 + system
- **「丢了什么」= key fact 在窗口外 → 模型「忘」**：对比卡片的 beforeReply / afterReply 是最直白的可观察证据
- **「什么时候该用滑动窗口」= 成本敏感 / 不在乎远期事实的场景**：摘要压缩有 1 次额外 LLM 调用成本 + 延迟（step-2 加）
- **不在 step-1**：摘要压缩、混合策略（远期摘要 + 近期原文）、按 token 算窗口、失败兜底降级。这些进 step-N。

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md](../../../docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md)

## 下一步

step-2（学习者已确认进）。建议方向见对话上下文（§6.3 变体覆盖 + §5.3.14 5b 主动建议三条路）。
