# 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-4 失败兜底降级

> step-4 状态：**✅ 已锁定**（2026-09-09）。§5.3.2 6 项齐 + `node scripts/check-demo.cjs` 过。冻结。

## 端口

`50043`

## 跑入口

```bash
cd apps && yarn app:06-02-compress-vs-window-step-4
```

浏览器：[http://127.0.0.1:50043/](http://127.0.0.1:50043/)

## 数据流

```text
浏览器调 5 个页面可调参数 + 「模拟摘要失败」开关
       │
       │  POST /api/three-way-with-fallback { ..., simulateSummarizeFail }
       ▼
koa bodyParser → Zod 校验
       │
       │  拼三份 messages（同 step-3）
       │    ──── 调真模型 #1（完整）────→ fullReply
       │    ──── 调真模型 #2（滑动窗口）→ slidingReply
       │
       │  [摘要 + 兜底]
       │    if simulateSummarizeFail = true:
       │      throw "摘要 LLM 模拟超时"
       │    else:
       │      try summary = summarizeOld(...)
       │      catch err → fallback 标记 used=true, reason=err.message
       │
       │    if fallback.used:
       │      ──── 调真模型 #3（兜底 · 用 messagesSliding 答题）→ fallbackReply
       │    else:
       │      拼 messagesSummarize
       │      ──── 调真模型 #3（摘要压缩）→ summarizeReply
       │
       │  返回 { full, sliding, summarize_or_fallback, fallback: { used, reason, fallbackMessages } }
       ▼
React 5 张卡：① 完整 ② 滑动窗口 ③ 摘要压缩 或 兜底版 ④ 兜底标记 ⑤ 三方对比小结
```

## 当前能做什么

- 5 个页面可调参数（同 step-3）
- 1 个开关「模拟摘要失败」
- 1 个按钮「跑对照（含兜底）」
- 默认模式（开关 off）：同 step-3 三方对照，摘要正常成功
- 模拟失败模式（开关 on）：摘要故意 throw → 服务端 catch → fallback 标记 used=true → 用滑动窗口答题（仍 200）
- 点「演示后端 5xx」→ 5xx 红字 + #status-pill ❌（这是与「兜底降级」对照的另一种失败通道）

## step-4 教学点

- **「摘要压缩的真实代价」= 1 次 LLM 调用 + 1~3s + **可能失败****
- **「用户不感知失败」= 服务端吞掉摘要失败，自动降级到滑动窗口 → 200 响应 + fallback.used=true**
- **「日志 warn 记录」= 服务端日志打「摘要失败，降级为滑动窗口」→ 事后运维可发现**
- **对照 step-3**：step-3 摘要失败 → 502 → 用户看到红字；step-4 摘要失败 → 200 + fallback 标记 → 用户无感知
- **覆盖需求清单需求 5「摘要失败兜底降级」**

## 对应学习沉淀

[docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md](../../../docs/学习模块/06-多轮对话与Context/02-压缩-摘要-vs-滑动窗口.md)

## 下一步

学习者主动锁定 step-4 后 → 5 条需求清单都已覆盖（1 长对话不崩 / 2 多步骤任务决策链 / 3 成本敏感 / 4 对比演示页 / 5 摘要失败兜底） → 可考虑 `coach complete` 过关检查 1→2→3 全过 → 勾 ✅ 本条。
