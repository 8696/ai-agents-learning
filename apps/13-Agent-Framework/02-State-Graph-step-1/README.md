# 状态图（State Graph）· step-1

对应小节：[docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md)

**端口**：`50142`（浏览器 [http://127.0.0.1:50142/](http://127.0.0.1:50142/)）

**怎么跑**：`cd apps && yarn app:13-02-state-graph-step-1`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/linear-graph`：先看见声明的五步（状态标注 / 登记节点 / 连边 / 编译 / 运行）和真实源代码，图还没跑。
- 点「按这张图走一单」：`POST /api/linear-graph`，`START → takeOrder → brewHot → serve → END` 跑一遍；每一站展示补丁、合并后的状态、这一站源代码、这一站是为了做什么。
- 条件分流 sub-page `/pages/conditional.html`（顶部 PageNav 跳转）：`GET /api/conditional-graph` 拿到 5 步声明 + 路径映射；点三个场景按钮（热拿铁 / 冰美式 / 抹茶）各走一次，路由函数按 drinkType 选 brewHot / brewIce / reject；跑完页面底部展示 routeChosen（这次为什么走这条边）。
- 空输入 → 400；「演示后端 5xx」→ 500。不调大模型。

## 数据流

```text
页面加载（index.html 线性图）
  GET /api/linear-graph → describeLinearGraph（只读声明）
客人原话
  POST /api/linear-graph → runLinearGraph
         ↓
    buildLinearGraph（StateGraph.addNode / addEdge / compile）
         ↓
    stream({ streamMode: "updates" })
         ↓
    每一站：patch + 合并后的状态 + 节点源代码

页面加载（pages/conditional.html 条件分流）
  GET /api/conditional-graph → describeConditionalGraph（声明 + 路径映射）
客人原话（三个场景按钮 或 自定义）
  POST /api/conditional-graph → runConditionalGraph
         ↓
    buildConditionalGraph（StateGraph.addNode / addConditionalEdges / addEdge / compile）
         ↓
    stream({ streamMode: "updates" })
         ↓
    每一站：patch + 合并后的状态 + 节点源代码
         ↓
    服务端算出 routeChosen（读了 drinkType = 什么 → 走到谁）→ 写进 ctx.body
```

依赖在 `apps/package.json`：`@langchain/langgraph`、`@langchain/core`。本步不调模型。
