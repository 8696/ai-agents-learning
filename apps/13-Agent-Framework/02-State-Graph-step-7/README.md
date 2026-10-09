# 状态图（State Graph）· step-7 子图

对应小节：[docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md)

**端口**：`50148`（浏览器 [http://127.0.0.1:50148/](http://127.0.0.1:50148/)）

**怎么跑**：`cd apps && yarn app:13-02-state-graph-step-7`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/parent-graph`：先看见声明的十一步（父图状态标注 / 子图 A 状态标注 / 子图 B 状态标注 / 父图三节点 / makeDrink 三 mode / 子图边 / 父图边 / 子图内 brewHot / 什么时候值得抽子图）和真实源代码，图还没跑。
- 三个场景按钮（flat / subgraph-same-fields / subgraph-renamed）：`POST /api/parent-graph`，服务端 invoke 跑一遍。runtime 里展示父图三站 + 子图内 brewHot（subgraph-same-fields / subgraph-renamed 模式有 subRuntime；flat 模式没有）。
- `flat` 模式：makeDrink 是普通节点函数——和子图内 brewHot 等价，但不抽成子图。
- `subgraph-same-fields` 模式：`parentGraph.addNode("makeDrink", subgraphSame)` 一行直接挂子图。同名字段（orderSlip / cupLabel / retryCount）自动传——无需 wrapper。
- `subgraph-renamed` 模式：父图挂的是 wrapper 节点函数；wrapper 手动调 `subRenamed.invoke({ drinkSlip })` 并把 `label` 翻回 `cupLabel`、`retries` 翻回 `retryCount`。
- 空输入 → 400；「演示后端 5xx」→ 500。不调大模型。

## 数据流

```text
页面加载（index.html 主子图）
  GET /api/parent-graph → describeParentGraph（只读声明）
客人口述 + 三个场景按钮之一
  POST /api/parent-graph → invokeParentGraph
         ↓
    buildParentGraph(mode) → 同一张父图，makeDrink 节点按 mode 切换
         ↓
    graph.stream(updates) → 累加 runtime
         ↓
    按 mode 补 subRuntime（页面展示子图内部 brewHot 那一站）
```

依赖在 `apps/package.json`：`@langchain/langgraph`（仓内已装）。本步不调模型。

## 教学对照

- **变体 I**：父图、子图都是同一种状态图——只是子图被当节点挂到父图上。同名字段自动传；不同名字段写 wrapper。
- **和 step-3 并行的关系**：step-3 是同一图里两个节点同时跑；step-7 是子图被父图当节点——嵌套而非并行。子图本身也可以并行（但本步没展开）。
- **和模块 11 的关系**：模块 11 你手写过「多个子状态机怎么编排」——这就是它的框架落点。父图和子图的状态字段同名才会自动传；不同名要自己转换（详见 [docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md) 变体 I）。