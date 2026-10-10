# Agents as Tools vs Handoff · step-2

对应小节：[docs/学习模块/13-Agent-Framework/03-Agents-as-Tools-vs-Handoff.md](../../../docs/学习模块/13-Agent-Framework/03-Agents-as-Tools-vs-Handoff.md)

**端口**：`50151`（浏览器 [http://127.0.0.1:50151/](http://127.0.0.1:50151/)）

**怎么跑**：`cd apps && yarn app:13-03-agents-as-tools-vs-handoff-step-2`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/scenario`：拿到固定场景（订单 A10086 + 两句用户原话：第一句触发首次移交，第二句触发再移交一次），页面头部摊开两边各自的下一句判据 + 入口代码 + 链式移交入口代码（伪代码字面量）。
- 左栏「当工具调用（mode: tool）」+ 右栏「任务移交链（mode: handoff）」并排：
  - 共用同一段对话：第 1 句触发 host → refund；第 2 句触发 refund → guide；第 3 句起由 guide 继续接。
  - 每栏各自一个「发送下一句」按钮，各自一次 POST /api/send-next（**两个独立请求，不打包**）。
  - 每栏独立的当前 Agent 徽标 + 消息列表 + 下一句判据。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。空入参 → POST /api/send-next 体缺失 → 400。不调大模型。

## 数据流

```text
页面加载（index.html）
  GET /api/scenario → FIXED_SCENARIO
    → 渲染上半页：固定场景（两段用户原话）+ 左栏 + 右栏首次 + 右栏再移交 入口代码（伪代码字面量）

右栏 第 1 次「发送下一句」（mode=handoff, userTurnCount=0）
  POST /api/send-next { mode: "handoff", currentAgent: "host", userTurnCount: 0 }
    ↓
  sendNext(input) → { appended, nextCurrentAgent: "refund", rationale: 首次移交 }
    ↓
  当前 Agent 切换：host → refund；总客服停在这里；退款专员成为当前 Agent
    ↓
  前端刷新：徽标变成「退款专员」；下一句判据显示「下一句进专员」

右栏 第 2 次「发送下一句」（mode=handoff, userTurnCount=1）
  POST /api/send-next { mode: "handoff", currentAgent: "refund", userTurnCount: 1 }
    ↓
  sendNext(input) → { appended, nextCurrentAgent: "guide", rationale: 再移交一次 }
    ↓
  当前 Agent 切换：refund → guide；专员也不在原地等导购返回值
    ↓
  前端刷新：徽标变成「导购」；下一句判据显示「下一句进导购」

左栏（mode=tool）多次：currentAgent 永远 = host；消息列表里专员的话塞进「工具返回值」格里
```

本步不调大模型：`lib/flow/agents-as-tools-vs-handoff.ts` 里总客服 + 退款专员 + 导购三位的话术循环硬编码（每 Agent 5 条循环，够看几次切换）。真接 SDK（OpenAI Agents SDK 的 `as_tool` / `handoffs` / `last_agent`、LangChain 的 agents as tools）留到模块 14。