# Agents as Tools vs Handoff · step-4

对应小节：[docs/学习模块/13-Agent-Framework/03-Agents-as-Tools-vs-Handoff.md](../../../docs/学习模块/13-Agent-Framework/03-Agents-as-Tools-vs-Handoff.md)

**端口**：`50153`（浏览器 [http://127.0.0.1:50153/](http://127.0.0.1:50153/)）

**怎么跑**：`cd apps && yarn app:13-03-agents-as-tools-vs-handoff-step-4`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/scenario`：拿到固定场景（订单 A10086 + 用户原话）+ 两栏对照：左栏 = 进线分流（mode: entry-routing，从第一句起当前 Agent = 退款专员），右栏 = 普通对话（mode: handoff，先总客服接，再移交）。
- 两栏共用同一段用户原话，但**第一句回复者不同**：
  - 左栏：第一句 = 退款专员直接开口（徽标从一开始就是「退款专员」）。
  - 右栏：第一句 = 总客服说「我把您转到退款专员」（徽标初始是「总客服」，点击一次后切到「退款专员」）。
- 每栏独立的当前 Agent 徽标 + 消息列表 + 下一句判据。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。空入参 → POST /api/send-next 体缺失 → 400。不调大模型。

## 数据流

```text
页面加载（index.html）
  GET /api/scenario → FIXED_SCENARIO
    → 渲染上半页：固定场景 + 左栏（进线分流）+ 右栏（中途分流）入口代码（伪代码字面量）

左栏 第 1 次「发送下一句」（mode=entry-routing, userTurnCount=0）
  POST /api/send-next { mode: "entry-routing", currentAgent: "refund", userTurnCount: 0 }
    ↓
  sendNext(input) → appended 2 条（system「进线分流」+ refund speech），nextCurrentAgent=refund
    ↓
  第一句回复者就是退款专员；徽标从一开始就是「退款专员」

右栏 第 1 次「发送下一句」（mode=handoff, userTurnCount=0）
  POST /api/send-next { mode: "handoff", currentAgent: "host", userTurnCount: 0 }
    ↓
  sendNext(input) → appended 3 条（host 移交 + system + refund speech），nextCurrentAgent=refund
    ↓
  第一句回复者是总客服（说「我把您转到退款专员」）；徽标从「总客服」切到「退款专员」

关键对照：左栏会话里没有「总客服调用专员再自己说」；右栏第一句由总客服接，第二句才切到专员
```

本步不调大模型：`lib/flow/agents-as-tools-vs-handoff.ts` 里 mock 总客服 + 退款专员的话术循环。