# 状态图（State Graph）· step-3 并行扇出扇入

对应小节：[docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md)

**端口**：`50144`（浏览器 [http://127.0.0.1:50144/](http://127.0.0.1:50144/)）

**怎么跑**：`cd apps && yarn app:13-02-state-graph-step-3`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/parallel-graph`：先看见声明的五步（状态标注 / 登记节点 / 连边 / 并行 / 编译）和真实源代码，图还没跑。
- 点三个场景按钮（不写归约函数 / 写 array 归约函数 / 两字段不冲突）：`POST /api/parallel-graph`，服务端 compile + stream 跑一遍；场景 1 故意让两个并行节点都写 `cupLabel` 触发框架报错；场景 2 用 array 归约函数合并；场景 3 让两个分支写不同字段。
- 空输入 → 400；「演示后端 5xx」→ 500。不调大模型。

## 数据流

```text
页面加载（index.html 并行图）
  GET /api/parallel-graph → describeParallelGraph（只读声明）
客人口述 + 三个场景按钮之一
  POST /api/parallel-graph → runParallelGraph
         ↓
    buildParallelGraph（StateGraph.addNode / addEdge（fan-out 两条） / addEdge（fan-in 两条） / compile）
         ↓
    stream({ streamMode: "updates" })
         ↓
    同一 super-step 内：takeOrder 写 orderSlip → 同 super-step 并行跑 branchHot / branchIce → 汇合到 serve → END
```

依赖在 `apps/package.json`：`@langchain/langgraph`、`@langchain/core`。本步不调模型。
