# Dify 等编排产品 · step-4

对应小节：[docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md](../../../docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md)

**端口**：`50157`（浏览器 [http://127.0.0.1:50157/](http://127.0.0.1:50157/)）

**怎么跑**：`cd apps && yarn app:13-04-dify-orchestration-step-4`

## 现在能做什么

- 首页 `/` 一页两栏对照（同一组 intent + paymentStatus，两栏各发一次独立请求）：
  - **左栏 · 手写条件分支** —— POST /api/conditional-branch。按 `intent` 选边（`chooseRouteByIntent`），**不核对 declared edgeTable**；`allowed=true`（条件分支不拦非法转移）。
  - **右栏 · 手写边表核对** —— POST /api/edge-table-check。同一段选边后按 declared `EDGE_TABLE`（`{ 已付款: [热饮出品, 冰饮出品], 未付款: [] }`）核对；不在名单 = `allowed=false` + `nextNode="拦截"`。
  - 三个 case 按钮一键填入：case 1 `热饮+已付款`（两栏都放行）、case 2 `冰饮+已付款`（两栏都放行）、case 3 `未付款想出品+未付款`（左放行 · 右拒绝）。
- 「同时跑两栏」按钮 → 浏览器侧 `Promise.all` 并行发两次独立请求。
- 「演示超界 4xx」按钮 → POST /api/conditional-branch { intent: "未知" } → 400 + 红字。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。
- **不调大模型**（§5.3.0 例外「纯协议形状 / UI 演示」）：脚本 mock 三个 case；目的是对照「脑补产品会拦 = 错」。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 50157 · 本地计算 · 不调大模型）

点「同时跑两栏」（浏览器侧并行）
  POST /api/conditional-branch { intent, paymentStatus }     ← 左栏独立请求
  POST /api/edge-table-check   { intent, paymentStatus }     ← 右栏独立请求
    ↓
  routes/conditional-branch.ts → runConditionalBranch(...) [lib/flow/conditional-vs-edge-table.ts]
  routes/edge-table-check.ts   → runEdgeTableCheck(...)     [lib/flow/conditional-vs-edge-table.ts]
    ↓                                                       ↓
  左：chooseRouteByIntent(intent) → chosenRoute；allowed=true 左：chooseRouteByIntent(intent) → chosenRoute → checkEdgeTable(payment, chosenRoute)
    ↓                                                       ↓
  返回 { chosenRoute, allowed, reason }                   左返回 { chosenRoute, nextNode, allowed, reason, edgeTable }
    ↓                                                       ↓
  前端：两栏各自展示「chosenRoute / nextNode / allowed / reason」
```

## 本步核心

- **`lib/flow/conditional-vs-edge-table.ts`**：含两个函数 `runConditionalBranch` 和 `runEdgeTableCheck`；共享 `chooseRouteByIntent(intent)`。右边栏 declared 一张 `EDGE_TABLE`（`{ 已付款: [热饮出品, 冰饮出品], 未付款: [] }`）。
- **对照核心**：
  - 左栏 `runConditionalBranch` → `allowed=true`（无条件放行）
  - 右栏 `runEdgeTableCheck` → `allowed` 取决于 declared 边表是否包含 `(paymentStatus, chosenRoute)` 这条边
- **教学点硬钉子**：
  1. 条件分支 ≠ 边表核对 —— 前者只按变量选边，后者按 declared 边表拒绝非法转移。
  2. 拦截按你 declared 的边表为准 —— 不能脑补「产品会拦」。
  3. case 3 是这一页最硬的对照钉子：左栏按 `intent="未付款想出品"` 选出来走；右栏 declared 边表里 `未付款 →` 是空 → 拒绝。

## 文件结构

```text
04-dify-orchestration-step-4/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50157）
│   └── flow/
│       └── conditional-vs-edge-table.ts ← 本步核心：runConditionalBranch + runEdgeTableCheck（共享 chooseRouteByIntent）
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── conditional-branch.ts          ← POST /api/conditional-branch（左栏）
│   ├── edge-table-check.ts            ← POST /api/edge-table-check（右栏）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 两栏对照页（含三个 case 按钮）
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo + step-1~3 提示）
    │   ├── conditional-branch-panel.js ← 左栏面板（琥珀系）
    │   └── edge-table-check-panel.js  ← 右栏面板（翠系）
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```

## 和 step-1 ~ step-3 的关系

| | step-1 | step-2 | step-3 | step-4 |
| -- | ------ | ------ | ------ | ------ |
| **教学点** | 循环和状态藏在哪 | 跨轮的字段归谁 | 画了圈 ≠ 不让你手作圈 + 闸门归谁写 | 条件分支 vs 边表核对 |
| **栏数** | 三栏 | 两栏 | 两栏 | 两栏 |
| **左栏** | 手写循环 · 真调 LLM | 会话变量 | 无次数变量（route 兜底） | 条件分支（不拦非法转移） |
| **中栏** | 智能体应用 · messages 不返 | （无） | （无） | （无） |
| **右栏** | 工作流画布 · 节点/变量可见 | 你自己的 state | 有次数变量（自己写的字段） | 边表核对（declared 边表） |
| **是否调大模型** | 左 / 中调，右不调 | 都不调 | 都不调 | 都不调 |