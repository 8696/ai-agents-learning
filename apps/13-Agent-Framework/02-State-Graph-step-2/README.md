# 状态图（State Graph）· step-2 回边循环

对应小节：[docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md)

**端口**：`50143`（浏览器 [http://127.0.0.1:50143/](http://127.0.0.1:50143/)）

**怎么跑**：`cd apps && yarn app:13-02-state-graph-step-2`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/back-edge`：先看见声明的五步（状态标注 / 登记节点 / 连边 / 编译 / 运行）和真实源代码，图还没跑。
- 点三个场景按钮（顺利 / 做坏一次 / 做坏到第三次）：`POST /api/back-edge`，服务端 compile + stream 跑一遍；每一站展示补丁、合并后的状态、retryCount 怎么涨、routeChosen（这次为什么走这条边）。
- 空输入 → 400；「演示后端 5xx」→ 500。不调大模型。

## 数据流

```text
页面加载（index.html 回边图）
  GET /api/back-edge → describeBackEdgeGraph（只读声明）
客人口述 + 三个场景按钮之一
  POST /api/back-edge → runBackEdgeGraph
         ↓
    buildBackEdgeGraph（StateGraph.addNode / addEdge / addConditionalEdges / compile）
         ↓
    stream({ streamMode: "updates" })
         ↓
    每一站：patch + 合并后的状态 + 节点源代码
```

依赖在 `apps/package.json`：`@langchain/langgraph`、`@langchain/core`。本步不调模型。
