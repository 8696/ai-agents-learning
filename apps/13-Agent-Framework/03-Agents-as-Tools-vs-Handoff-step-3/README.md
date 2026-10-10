# Agents as Tools vs Handoff · step-3

对应小节：[docs/学习模块/13-Agent-Framework/03-Agents-as-Tools-vs-Handoff.md](../../../docs/学习模块/13-Agent-Framework/03-Agents-as-Tools-vs-Handoff.md)

**端口**：`50152`（浏览器 [http://127.0.0.1:50152/](http://127.0.0.1:50152/)）

**怎么跑**：`cd apps && yarn app:13-03-agents-as-tools-vs-handoff-step-3`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/scenario`：拿到固定场景（耳机 A10086 有货吗 + 几天到）+ 两栏对照：左栏 = 单 tool_call（mode: tool），右栏 = 同一轮两个 tool_call 并行（mode: tool-multi）+ 各自的下一句判据 + 入口代码（伪代码字面量）。
- 每栏各一个「发送下一句」按钮，各自一次 POST /api/send-next（**两个独立请求，不打包**）。
- 每栏独立的当前 Agent 徽标 + 消息列表 + 下一句判据。
- 左栏（mode: tool）一次只发一个 tool_call；右栏（mode: tool-multi）一次发两个 tool_call，对照「单 tool_call vs 多 tool_call 并行」。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。空入参 → POST /api/send-next 体缺失 → 400。不调大模型。

## 数据流

```text
页面加载（index.html）
  GET /api/scenario → FIXED_SCENARIO
    → 渲染上半页：固定场景 + 左栏（单 tool_call）+ 右栏（多 tool_call 并行）入口代码

左栏 第 1 次「发送下一句」（mode=tool, userTurnCount=0）
  POST /api/send-next { mode: "tool", currentAgent: "host", userTurnCount: 0 }
    ↓
  sendNext(input) → appended 3 条（tool-call 库存 + tool-result + host speech），nextCurrentAgent=host
    ↓
  消息列表追加 3 条；徽标保持「总客服」

右栏 第 1 次「发送下一句」（mode=tool-multi, userTurnCount=0）
  POST /api/send-next { mode: "tool-multi", currentAgent: "host", userTurnCount: 0 }
    ↓
  sendNext(input) → appended 5 条（2 个 tool-call + 2 个 tool-result + host 汇总 speech），nextCurrentAgent=host
    ↓
  消息列表追加 5 条；徽标保持「总客服」

关键对照：右栏同一轮发出 2 个 tool_call，2 段专结论都进 host 的 tool_result；下一句仍由总客服接
```

本步不调大模型：`lib/flow/agents-as-tools-vs-handoff.ts` 里 mock 库存 / 物流专员的话术循环。