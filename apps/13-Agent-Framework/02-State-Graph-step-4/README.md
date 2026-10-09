# 状态图（State Graph）· step-4 非法转移

对应小节：[docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md)

**端口**：`50145`（浏览器 [http://127.0.0.1:50145/](http://127.0.0.1:50145/)）

**怎么跑**：`cd apps && yarn app:13-02-state-graph-step-4`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/invalid-edge`：先看见声明的五步（状态标注 / 登记节点 / 连边 / 路由函数 + 路径映射 / 编译）和真实源代码，图还没跑。
- 点三个场景按钮（正常路径 / 非法转移 / 路由函数兜底）：`POST /api/invalid-edge`，服务端 compile + stream 跑一遍；「非法转移」模式 pathMap 缺 `unknown`，路由返回 `unknown` 时 framework 抛「pathMap 里没有这个键」；「路由函数兜底」模式路由函数对未识别 drinkType 返回 reject，优雅走完。
- 空输入 → 400；「演示后端 5xx」→ 500。不调大模型。

## 数据流

```text
页面加载（index.html 非法转移图）
  GET /api/invalid-edge → describeInvalidEdgeGraph（只读声明）
客人口述 + 三个场景按钮之一
  POST /api/invalid-edge → runInvalidEdgeGraph
         ↓
    buildInvalidEdgeGraph（StateGraph.addNode / addConditionalEdges（pathMap 按 mode 变化）/ compile）
         ↓
    stream({ streamMode: "updates" })
         ↓
    每一站：patch + 合并后的状态 + 节点源代码
```

依赖在 `apps/package.json`：`@langchain/langgraph`、`@langchain/core`。本步不调模型。
