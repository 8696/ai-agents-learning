# 状态图（State Graph）· step-6 递归上限

对应小节：[docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md)

**端口**：`50147`（浏览器 [http://127.0.0.1:50147/](http://127.0.0.1:50147/)）

**怎么跑**：`cd apps && yarn app:13-02-state-graph-step-6`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/recursion-graph`：先看见声明的八步（状态标注 / 登记节点 / 连边 / 三个 mode 路由函数对比 / 路径映射 / `compile({ recursionLimit })` / graceful try/catch / 跟模块 07 maxRounds 差别）和真实源代码，图还没跑。
- 三个场景按钮（well-behaved / always-broken / graceful）：`POST /api/recursion-graph`，服务端 invoke 跑一遍。`well-behaved` 收敛到 END；`always-broken` 跑满 `recursionLimit` 抛 `GraphRecursionError` → 5xx；`graceful` 同 `always-broken` 但外层 try/catch → 200 + `stoppedReason: "recursion_limit"`。
- runtime 卡显示抛错前跑过的每一站——即使 `always-broken` 抛错，仍能数出「图实际跑了几站才撞上限」。
- 页面顶有 recursionLimit 数值输入（2~50），对应 `compile({ recursionLimit })` 入参。
- 空输入 → 400；「演示后端 5xx」→ 500。不调大模型。

## 数据流

```text
页面加载（index.html 递归上限图）
  GET /api/recursion-graph → describeRecursionGraph（只读声明）
客人口述 + recursionLimit + 三个场景按钮之一
  POST /api/recursion-graph → invokeRecursionGraph
         ↓
    buildRecursionGraph(mode, recursionLimit) → 同一张图，三 mode 路由不同
         ↓
    graph.stream(...) 边跑边累加 runtime
         ↓
    按 mode 分流：
      well-behaved   → 路由收敛 → serve → END → 200 completed
      always-broken  → 路由忘写上限 → 跑满 → 抛 GraphRecursionError → 5xx
      graceful       → 同 always-broken，外层 try/catch → 200 recursion_limit
```

依赖在 `apps/package.json`：`@langchain/langgraph`（仓内已装）。本步不调模型。

## 教学对照

- **变体 H**：和模块 07 `maxRounds` 差两件事——超级步 ≠ 模型轮次；状态图默认抛异常，要体面得外层 try/catch。
- **和 step-2 回边循环的关系**：step-2 是「正确写上限，3 次后收敛」；step-6 是「忘写上限 / 写错条件，跑满 `recursionLimit` 抛错」。两者是同一机制的「守门员有没有站岗」两面。