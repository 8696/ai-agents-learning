# 状态图（State Graph）· step-5 检查点 + 中断

对应小节：[docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md)

**端口**：`50146`（浏览器 [http://127.0.0.1:50146/](http://127.0.0.1:50146/)）

**怎么跑**：`cd apps && yarn app:13-02-state-graph-step-5`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/checkpoint-graph`：先看见声明的六步（状态标注 / 登记节点 / 连边 / interrupt + resume / compile / idempotencyKey）和真实源代码，图还没跑。
- 三个场景按钮（无检查点 / MemorySaver / MemorySaver + interrupt）：`POST /api/checkpoint-graph`，服务端 invoke 跑一遍。`memory-saver-interrupt` 模式第一次 invoke 触发 interrupt → 服务端返 `status: "interrupted"` + interruptValue → 前端显示「点确认 / 取消」按钮 → 第二次 invoke 带 `resume: true / false` 继续。
- MemorySaver 同进程内跨请求能恢复（杀进程即丢）。教学文案讲清 SqliteSaver 才能抗重启（本 demo 不装，避免依赖变重）。
- `chargeMemberCard` 节点用 idempotencyKey 防重扣——节点重跑时不会被扣两次。
- 空输入 → 400；「演示后端 5xx」→ 500。不调大模型。

## 数据流

```text
页面加载（index.html 检查点 + 中断图）
  GET /api/checkpoint-graph → describeCheckpointGraph（只读声明）
客人口述 + threadId + 三个场景按钮之一
  POST /api/checkpoint-graph → invokeCheckpointGraph
         ↓
    buildCheckpointGraphWithSaver（按 mode 决定是否传 MemorySaver）
         ↓
    graph.invoke(...) — interrupt 模式第一次返 __interrupt__；resume 模式用 Command({ resume }) 继续
         ↓
    服务端检查 status：completed / interrupted / resumed；返回 finalState + runtime + checkpointCount
```

依赖在 `apps/package.json`：`@langchain/langgraph`、`@langchain/langgraph-checkpoint`（仓内已装）。本步不调模型。
