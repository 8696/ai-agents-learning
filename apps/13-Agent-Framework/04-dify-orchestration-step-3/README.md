# Dify 等编排产品 · step-3

对应小节：[docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md](../../../docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md)

**端口**：`50156`（浏览器 [http://127.0.0.1:50156/](http://127.0.0.1:50156/)）

**怎么跑**：`cd apps && yarn app:13-04-dify-orchestration-step-3`

## 现在能做什么

- 首页 `/` 一页两栏对照（同一组参数，两栏各发一次独立请求）：
  - **左栏 · 无次数变量** —— POST /api/loop-edge-without-counter。模拟「画了回边但**没有**自己写的 counter 变量」= 库存永远缺 → 一圈一圈拉回 → maxRounds 闸门触发。
  - **右栏 · 有次数变量** —— POST /api/loop-edge-with-counter。模拟「画了回边 + **自己写**一个 counter 变量」= 每拉回一次 + 1 → counterLimit 退出（默认 3）。
  - 共用同一组参数：库存缺（`inStock=false`）+ `maxRounds=6` + `counterLimit=3`。
- 控件区可调 `maxRounds`（1~12）+ `counterLimit`（1~12）。
- 「同时跑两栏」按钮 → 浏览器侧 `Promise.all` 并行发两次独立请求（**不是 `/api/compare` 打包**）。
- 「演示超界 4xx」按钮 → POST /api/loop-edge-without-counter { maxRounds: 999 } → 400 + 红字（第一类错误）。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字（第二类错误）。
- **不调大模型**（§5.3.0 例外「纯协议形状 / UI 演示」）：脚本 mock 库存查询；目的是对照"画了圈 ≠ 不让你手作圈" + "没有次数变量就一直转"。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 50156 · 本地计算 · 不调大模型）

点「同时跑两栏」（浏览器侧并行）
  POST /api/loop-edge-without-counter { inStock: false, maxRounds: 6 }     ← 左栏独立请求
  POST /api/loop-edge-with-counter       { inStock: false, maxRounds: 6, counterLimit: 3 }  ← 右栏独立请求
    ↓                                                                       ↓
  routes/loop-edge-without-counter.ts → runWithoutCounter(...)   [lib/flow/loop-edge.ts]
  routes/loop-edge-with-counter.ts     → runWithCounter(...)      [lib/flow/loop-edge.ts]
    ↓                                                                       ↓
  左：runLoop({ hasCounter: false }) → 圈 N+1 → 闸门触发
  右：runLoop({ hasCounter: true })  → 圈 N+1 → counter 达 counterLimit 退出
    ↓                                                                       ↓
  返回 { turns, rounds, stoppedReason }（右多 counterValue / counterLimit）
    ↓
  前端：两栏各自展示「画布形状 + rounds / 终止原因 + 轨迹列表」
```

## 本步核心

- **`lib/flow/loop-edge.ts`**：含两个函数 `runWithoutCounter` 和 `runWithCounter`；共享 `runLoop({ hasCounter, inStock, maxRounds, counterLimit })`。
- **闸门差异**：
  - 左栏 = `maxRounds`（route 层兜底，闸门不归你）；到 `maxRounds` 强行停，原因是 `maxRounds`。
  - 右栏 = `counterLimit`（你仓库里 declared 的字段）；每拉回 counter + 1，到 `counterLimit` 退出，原因是 `counterLimit`。
- **教学点硬钉子**：
  1. 画了回边 ≠ 产品替你跑圈 —— 执行权仍归产品，没自己写的闸门就靠 maxRounds 兜底。
  2. 没写次数变量就一直转 —— 库存永远缺，每一圈都拉回。
  3. 闸门归你写 = 你仓库里 declared 的字段（对照模块 07 的 `maxIterations` 闸门）。

## 文件结构

```text
04-dify-orchestration-step-3/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50156）
│   └── flow/
│       └── loop-edge.ts               ← 本步核心：runWithoutCounter + runWithCounter（共享 runLoop）
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── loop-edge-without-counter.ts   ← POST /api/loop-edge-without-counter（左栏）
│   ├── loop-edge-with-counter.ts      ← POST /api/loop-edge-with-counter（右栏）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 两栏对照页
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo + step-1 / step-2 提示）
    │   ├── loop-edge-without-counter-panel.js ← 左栏面板（红系）
    │   └── loop-edge-with-counter-panel.js    ← 右栏面板（绿系）
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```

## 和 step-1 / step-2 的关系

| | step-1 | step-2 | step-3 |
| -- | ------ | ------ | ------ |
| **教学点** | 循环和状态藏在哪 | 跨轮的字段归谁 | 画了的圈 ≠ 不让你手作圈 + 闸门归谁写 |
| **栏数** | 三栏（左 / 中 / 右） | 两栏（左 / 右） | 两栏（左 / 右） |
| **左栏** | 手写循环 · 真调 LLM | 会话变量（产品） | 无次数变量（route 兜底） |
| **中栏** | 智能体应用 · 同样的 while · messages 不返 | （无） | （无） |
| **右栏** | 工作流画布 · 不调 LLM | 你自己的 state（仓库） | 有次数变量（自己写的字段） |
| **是否调大模型** | 左 / 中调，右不调 | 都不调 | 都不调 |
| **同变体** | —— | 都涉及"跨轮字段" → 需求 3「会话变量保住杯型」 | 都涉及"画圈 / 写闸门" → 需求 4「回边 + 次数变量」 |