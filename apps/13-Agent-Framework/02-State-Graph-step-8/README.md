# 状态图（State Graph）· step-8 什么时候才该上图

对应小节：[docs/学习模块/13-Agent-Framework/02-State-Graph.md](../../../docs/学习模块/13-Agent-Framework/02-State-Graph.md)

**端口**：`50149`（浏览器 [http://127.0.0.1:50149/](http://127.0.0.1:50149/)）

**怎么跑**：`cd apps && yarn app:13-02-state-graph-step-8`

## 现在能做什么

- 首页 `/` 加载时 `GET /api/when-to-graph`：先看见声明的六步（状态标注 / answerDirect 节点 / over-graphed 三节点 / 两种边 / 判断口诀）和真实源代码，图还没跑。
- 两个场景按钮（`flat-single-node` / `over-graphed`）：`POST /api/when-to-graph`，服务端 invoke 跑一遍。
- `flat-single-node`：单节点直接给「店几点关门」的答案——runtime 1 站、stationsRun=1、answer 字段有值。**正确形状**。
- `over-graphed`：FAQ 硬套完整进出图——runtime 3 站、stationsRun=3、orderSlip / cupLabel / pickupCall 三个字段被写入（和「几点关门」毫无关系）。**可观察的代价**。
- 页面顶部 + view步骤 ⑥ 写出判断口诀：「**步骤能提前画出来 → 上图；下一步只有模型临场才知道 → 留给模块 07 那种循环**」。
- 空输入 → 400；「演示后端 5xx」→ 500。不调大模型。

## 数据流

```text
页面加载（index.html 该不该上图）
  GET /api/when-to-graph → describeWhenToGraph（只读声明）
问题 + 两个场景按钮之一
  POST /api/when-to-graph → invokeWhenToGraph
         ↓
    buildWhenToGraph(mode) → 按 mode 装配图
         ↓
    graph.stream(updates) → 累加 runtime
         ↓
    flat 模式 runtime 1 行，over-graphed 模式 runtime 3 行——页面比对 stationsRun 字段
```

依赖在 `apps/package.json`：`@langchain/langgraph`（仓内已装）。本步不调模型。

## 教学对照

- **变体 J**：本页核心。
- **和变体 E「非法转移」对照**：变体 E = 图画了但路径映射没列 → 框架抛异常（接口级报错）；变体 J = 图根本不该画 → runtime 浪费得不值得（结构级错误）。
- **和模块 07「多步循环」的关系**：模块 07 是「下一步不可预测」的兜底——状态图管不住的部分让模型自主循环。判断口诀里第二行就是这条边界。
- **和模块 14 多 Agent 的关系**：这一变体也提示——多 Agent 也不是万能，不要「反正都是框架，写什么都用框架」。