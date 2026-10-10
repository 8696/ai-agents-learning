# Dify 等编排产品 · step-5

对应小节：[docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md](../../../docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md)

**端口**：`50158`（浏览器 [http://127.0.0.1:50158/](http://127.0.0.1:50158/)）

**怎么跑**：`cd apps && yarn app:13-04-dify-orchestration-step-5`

## 现在能做什么

- 首页 `/` 一页两栏对照（同一组 cupSize + drinkType，两栏各发一次独立请求）：
  - **左栏 · 写出输出变量** —— POST /api/code-node-with-output。代码节点算出 price 并**写进输出变量 outputVars.price** → 下游能读到。
  - **右栏 · 忘了写输出变量** —— POST /api/code-node-without-output。代码节点算出 priceInCode 但**没写到 outputVars** → 下游读不到 price。
  - 定价表：BASE=28 + 大杯 +8 / 中杯 +6 / 小杯 +4 + 冰饮 +2；命中「中杯+热饮」= ¥34。
- 共用同一组入参（cupSize + drinkType）。
- 「同时跑两栏」按钮 → 浏览器侧 `Promise.all` 并行发两次独立请求。
- 「演示超界 4xx」按钮 → POST /api/code-node-with-output { cupSize: "超大杯" } → 400 + 红字。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。
- **不调大模型**（§5.3.0 例外「纯协议形状 / UI 演示」）：脚本 mock 定价；目的是对照「局部变量函数返回丢 / 输出变量才进全图状态」。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 50158 · 本地计算 · 不调大模型）

点「同时跑两栏」（浏览器侧并行）
  POST /api/code-node-with-output    { cupSize, drinkType }     ← 左栏独立请求
  POST /api/code-node-without-output { cupSize, drinkType }     ← 右栏独立请求
    ↓
  routes/code-node-with-output.ts    → runCodeNodeWithOutput(...)    [lib/flow/code-node.ts]
  routes/code-node-without-output.ts → runCodeNodeWithoutOutput(...) [lib/flow/code-node.ts]
    ↓                                                              ↓
  左：computePrice + 写 outputVars.price                       右：computePrice + 不写 outputVars.price
    ↓                                                              ↓
  返回 { priceInCode, outputVars, note }                       返回 { priceInCode, outputVars, note }
    ↓
  前端：两栏各自展示「priceInCode + outputVars（表）+ outputVars.price 是否有」
```

## 本步核心

- **`lib/flow/code-node.ts`**：含两个函数 `runCodeNodeWithOutput` 和 `runCodeNodeWithoutOutput`；共享 `computePrice(cupSize, drinkType)`。差异只在「有没有写 outputVars.price」。
- **对照核心**：
  - 左栏 `outputVars = { cupSize, drinkType, price }` → 下游能读到 price
  - 右栏 `outputVars = { cupSize, drinkType }` → 下游读不到 price（price 只活在 `priceInCode` 这一格里，函数返回就丢）
- **教学点硬钉子**：
  1. 局部变量 `priceInCode` 函数返回就丢 —— 没写到 `outputVars` → 没了
  2. 下游能不能读到 = 看有没有写到 `outputVars` —— 写出来 = 进全图状态，不写 = 上游吃掉了
  3. 这和 step-3 step-4 同类对照 ——「画了 / 写了 ≠ 暴露给全图状态」

## 文件结构

```text
04-dify-orchestration-step-5/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50158）
│   └── flow/
│       └── code-node.ts               ← 本步核心：runCodeNodeWithOutput + runCodeNodeWithoutOutput（共享 computePrice）
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── code-node-with-output.ts       ← POST /api/code-node-with-output（左栏）
│   ├── code-node-without-output.ts    ← POST /api/code-node-without-output（右栏）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 两栏对照页
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo + step-1~4 提示）
    │   ├── code-node-with-output-panel.js    ← 左栏面板（翠系）
    │   └── code-node-without-output-panel.js ← 右栏面板（红系）
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```

## 和 step-1 ~ step-4 的关系

| | step-1 | step-2 | step-3 | step-4 | step-5 |
| -- | ------ | ------ | ------ | ------ | ------ |
| **教学点** | 循环和状态藏在哪 | 跨轮的字段归谁 | 画了圈 ≠ 不让你手作圈 + 闸门归谁写 | 条件分支 vs 边表核对 | 局部变量 vs 输出变量 |
| **栏数** | 三栏 | 两栏 | 两栏 | 两栏 | 两栏 |
| **左栏** | 手写循环 · 真调 LLM | 会话变量 | 无次数变量（route 兜底） | 条件分支（不拦非法转移） | 写出 outputVars（下游能读到） |
| **中栏** | 智能体应用 · messages 不返 | （无） | （无） | （无） | （无） |
| **右栏** | 工作流画布 · 节点/变量可见 | 你自己的 state | 有次数变量（自己写的字段） | 边表核对（declared 边表） | 忘了写 outputVars（下游读不到） |
| **是否调大模型** | 左 / 中调，右不调 | 都不调 | 都不调 | 都不调 | 都不调 |
| **同变体** | —— | 需求 3 跨轮字段 | 需求 4 画圈 / 闸门 | 需求 6 选边 / 边表 | 需求 7 局部变量 / 输出变量 |