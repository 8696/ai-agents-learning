# Agents as Tools vs Handoff · step-1

对应小节：[docs/学习模块/13-Agent-Framework/03-Agents-as-Tools-vs-Handoff.md](../../../docs/学习模块/13-Agent-Framework/03-Agents-as-Tools-vs-Handoff.md)

**端口**：`50150`（浏览器 [http://127.0.0.1:50150/](http://127.0.0.1:50150/)）

**怎么跑**：`cd apps && yarn app:13-03-agents-as-tools-vs-handoff-step-1`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/scenario`：拿到固定场景（订单 A10086 + 用户原话），两栏对照页头部摊开两边各自的下一句判据 + 入口代码（伪代码字面量），可以一行行读。
- 左栏「当工具调用（mode: tool）」+ 右栏「任务移交（mode: handoff）」并排：
  - 共用同一个用户原话（订单 A10086，耳机右耳没声音想退款）。
  - 每栏各自一个「发送下一句」按钮，各自一次 POST /api/send-next（**两个独立请求，不打包**）。
  - 每栏独立的当前 Agent 徽标 + 消息列表 + 下一句判据。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。空入参 → POST /api/send-next 体缺失 → 400。不调大模型。

## 数据流

```text
页面加载（index.html）
  GET /api/scenario → FIXED_SCENARIO
    → 渲染上半页：固定场景文本 + 两栏判据 + 入口代码（伪代码字面量）

点「发送下一句」左栏（mode=tool）
  POST /api/send-next { mode: "tool", currentAgent: "host", userTurnCount: 0 }
    ↓
  sendNext(input) → { appended, nextCurrentAgent, rationale }
    ↓
  当前 Agent 不切换；总客服消息列表追加「工具调用 + 工具返回值 + 总客服的话」
    ↓
  前端刷新：徽标保持「总客服」；消息列表新增 3 条；下一句判据显示「下一句仍进总客服」

点「发送下一句」右栏（mode=handoff）
  POST /api/send-next { mode: "handoff", currentAgent: "host", userTurnCount: 0 }
    ↓
  sendNext(input) → { appended, nextCurrentAgent: "refund", rationale }
    ↓
  当前 Agent 切换；总客服停在这里；退款专员成为当前 Agent；专员的话追加到退款专员列表
    ↓
  前端刷新：徽标立刻变成「退款专员」；下一句判据显示「下一句进专员」
```

本步不调大模型：`lib/flow/agents-as-tools-vs-handoff.ts` 里总客服 + 退款专员的话术循环硬编码（5 条循环，够看几次切换）。真接 SDK（OpenAI Agents SDK 的 `as_tool` / `handoffs` / `last_agent`、LangChain 的 agents as tools）留到模块 14。