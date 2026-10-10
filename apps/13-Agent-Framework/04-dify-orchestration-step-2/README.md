# Dify 等编排产品 · step-2

对应小节：[docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md](../../../docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md)

**端口**：`50155`（浏览器 [http://127.0.0.1:50155/](http://127.0.0.1:50155/)）

**怎么跑**：`cd apps && yarn app:13-04-dify-orchestration-step-2`

## 现在能做什么

- 首页 `/` 一页两栏对照（同一对句，两栏各发一次独立请求）：
  - **左栏 · 会话变量（产品端）** —— POST /api/conversation-vars。模拟产品里的 `sessionVars` 面板（`cupSize` / `drinkType` / `lastUpdateRound`），跨轮字段归产品替你存（重启产品可能丢）。
  - **右栏 · 你自己的 state（你端）** —— POST /api/your-state。模拟你 declared 的 TypeScript `OrderState`（对照模块 11），跨轮字段在你仓库里，commit 进 git 就在。
  - 共用同一对句：第一句「大杯热拿铁」+ 第二句「还是大杯，换成冰的」—— 第二轮两栏都拿到 `cupSize=大杯`，但**持有方不同**。
- 「同时跑两栏」按钮 → 浏览器侧 `Promise.all` 并行发两次独立请求（**不是 `/api/compare` 打包**）。
- 「演示空入参 4xx」按钮 → POST /api/conversation-vars { text1: "" } → 400 + 红字（第一类错误）。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字（第二类错误）。
- **不调大模型**（§5.3.0 例外「纯协议形状 / UI 渲染层演示」）：脚本 mock 两轮对话剧本，目的是对照"跨轮的字段归谁"，不是真的去跑一个产品 / 一段状态机。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 50155 · 本地计算 · 不调大模型）

点「同时跑两栏」（浏览器侧并行）
  POST /api/conversation-vars { text1, text2 }     ← 左栏独立请求
  POST /api/your-state       { text1, text2 }     ← 右栏独立请求
    ↓                                                  ↓
  routes/conversation-vars.ts → runConversationVars(...) [lib/flow/conversation-vars.ts]
  routes/your-state.ts       → runYourState(...)       [lib/flow/your-state.ts]
    ↓                                                  ↓
  左：两轮解析 → 更新 sessionVars（覆盖式合并；没解析到的字段保留上一轮）
  右：两轮解析 → 更新 OrderState（覆盖式合并；没解析到的字段保留上一轮）
    ↓                                                  ↓
  返回 { sessionVars, turns: [round1, round2] }   返回 { state, turns: [round1, round2] }
    ↓
  前端：两栏各自展示「字段面板 + 两轮对话记录」
```

## 本步核心

- **左栏 `lib/flow/conversation-vars.ts`**：维护一个跨轮活着的 `sessionVars` 对象；每轮解析 cupSize / drinkType → 覆盖式合并。**不持久化，重启服务就丢**。
- **右栏 `lib/flow/your-state.ts`**：维护一个 declared 的 TypeScript `OrderState`（对照模块 11 风格）；每轮解析 cupSize / drinkType → 覆盖式合并。**持久化 = 你仓库 git commit**。
- **两栏共用同一对句**：第一句「大杯热拿铁」+ 第二句「还是大杯，换成冰的」—— 第二轮两栏都拿到 `cupSize=大杯`，但**字段归谁不同**：
  - 左栏 `sessionVars.cupSize` → 产品服务器
  - 右栏 `OrderState.cupSize` → 你 TypeScript 类型
- **教学点**：会话变量 ≠ 你 state；两者都不是模块 10 的记忆（记忆是另一套检索 + 摘要，不是「还记得上一轮」的字段）。

## 文件结构

```text
04-dify-orchestration-step-2/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50155）
│   └── flow/
│       ├── conversation-vars.ts       ← 左栏主流程：runConversationVars(text1, text2) → sessionVars + turns
│       └── your-state.ts              ← 右栏主流程：runYourState(text1, text2) → OrderState + turns
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── conversation-vars.ts           ← POST /api/conversation-vars（左栏）
│   ├── your-state.ts                  ← POST /api/your-state（右栏）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 两栏对照页
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo + step-1 提示）
    │   ├── conversation-vars-panel.js ← 左栏面板（蓝系）
    │   └── your-state-panel.js        ← 右栏面板（琥珀系）
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```

## 和 step-1 的关系

| | step-1 | step-2 |
| -- | ------ | ------ |
| **教学点** | 循环和状态藏在哪 | 跨轮的字段归谁 |
| **栏数** | 三栏（左 / 中 / 右） | 两栏（左 / 右） |
| **左栏** | 手写循环 · 真调 LLM · 暴露 messages | 会话变量 · 不调 LLM · 暴露 sessionVars |
| **中栏** | 智能体应用 · 同样的 while · messages 不返 | （无） |
| **右栏** | 工作流画布 · 不调 LLM · 节点 / 变量可见 | 你自己的 state · 不调 LLM · declared TypeScript |
| **是否调大模型** | 左 / 中调，右不调 | 都不调（§5.3.0 例外「纯协议形状演示」） |
| **同变体** | —— | 都涉及"跨轮字段" → step-1 step-2 把这一条讲清（需求 3「会话变量保住杯型」） |