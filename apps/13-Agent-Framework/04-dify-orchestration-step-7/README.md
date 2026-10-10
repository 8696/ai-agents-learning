# Dify 等编排产品 · step-7

对应小节：[docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md](../../../docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md)

**端口**：`50160`（浏览器 [http://127.0.0.1:50160/](http://127.0.0.1:50160/)）

**怎么跑**：`cd apps && yarn app:13-04-dify-orchestration-step-7`

## 现在能做什么

- 首页 `/` 一页两栏对照（同一组 refundRequestId + amount + killAt，两栏各发一次独立请求；**都不调大模型**）：
  - **左栏 · 仅人工方块** —— POST /api/human-only。等人工点头 + 调扣款；**没**写 checkpoint + **没**做 idempotency_key 去重；`killAt=before-charge` 时本次调用就重复扣款（`chargedTimes=2`）。
  - **右栏 · 人工方块 + checkpoint + idempotency** —— POST /api/human-with-checkpoint。等人工点头 + **写 checkpoint**（stage=approved）+ 调扣款（**检查 idempotency_key**）；`killAt=before-charge` 时本次调用恢复 + 不重复扣款（`chargedTimes=1`）。
  - 默认 refundRequestId = `R-20261010-001`，amount = `199`，killAt = `before-charge`。
- 共用同一组入参（refundRequestId + amount + killAt）；killAt 选 none 是正常流程、before-charge 模拟「调扣款前杀进程」。
- 「同时跑两栏」按钮 → 浏览器侧 `Promise.all` 并行发两次独立请求。
- 「演示空入参 4xx」按钮 → POST /api/human-only { refundRequestId: "" } → 400 + 红字。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。
- **不调大模型**（§5.3.0 例外「纯协议形状 / UI 演示」）：用 mock in-memory `STORE = { checkpoints, charges }` Map 模拟持久化层（生产用 SQLite / better-sqlite3）。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 50160 · 本地计算 · 不调大模型）

点「同时跑两栏」（浏览器侧并行）
  POST /api/human-only            { refundRequestId, amount, killAt }   ← 左栏独立请求
  POST /api/human-with-checkpoint { refundRequestId, amount, killAt }   ← 右栏独立请求
    ↓
  routes/human-only.ts            → runHumanApprovalOnly(...)            [lib/flow/human-vs-checkpoint.ts]
  routes/human-with-checkpoint.ts  → runHumanApprovalWithCheckpoint(...)  [lib/flow/human-vs-checkpoint.ts]
    ↓                                                              ↓
  左：等点头 + 调扣款（mockCharge 不查 STORE.charges）        右：检查 checkpoint → 等点头 → 写 checkpoint → 调扣款（mockCharge 检查 STORE.charges）
    ↓                                                              ↓
  返回 { chargedTimes, checkpointPersisted, idempotencyApplied, steps, note }
    ↓
  前端：两栏各自展示「chargedTimes + checkpoint / idempotency 状态 + 流程步骤 + note」
```

## 本步核心

- **`lib/flow/human-vs-checkpoint.ts`**：含两个函数 `runHumanApprovalOnly` 和 `runHumanApprovalWithCheckpoint`；共享 `STORE.checkpoints` + `STORE.charges` + `mockCharge`（带 idempotency_key）+ `saveCheckpoint` / `loadCheckpoint`。差异只在「写不写 checkpoint + 检查不检查 idempotency_key」。
- **对照核心**：
  - 左栏 `runHumanApprovalOnly` —— 不写 checkpoint + 不检查 idempotency → 进程杀掉后**重复扣款**（`chargedTimes=2`）
  - 右栏 `runHumanApprovalWithCheckpoint` —— 写 checkpoint + 检查 idempotency → 进程杀掉后**不重复扣款**（`chargedTimes=1`）
- **教学点硬钉子**：
  1. 「等点头」方块（产品界面）≠ 检查点 + idempotency —— 暂停的方块只表示「等人点头」，不能保证 kill 后能恢复
  2. 进程杀掉 + 重启 = 你自己写的 checkpoint + idempotency 才是关键
  3. 模块 11 的 Checkpoint + 模块 11 的 idempotency_key 才是「不重复扣款」的来源 —— 产品的方块都只是辅助

## 文件结构

```text
04-dify-orchestration-step-7/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50160）
│   └── flow/
│       └── human-vs-checkpoint.ts     ← 本步核心：runHumanApprovalOnly + runHumanApprovalWithCheckpoint（共享 mock STORE）
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── human-only.ts                  ← POST /api/human-only（左栏）
│   ├── human-with-checkpoint.ts       ← POST /api/human-with-checkpoint（右栏）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 两栏对照页
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo + step-1~6 提示）
    │   ├── human-only-panel.js        ← 左栏面板（红系）
    │   └── human-with-checkpoint-panel.js ← 右栏面板（绿系）
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```

## 和 step-1 ~ step-6 的关系

| | step-1 | step-2 | step-3 | step-4 | step-5 | step-6 | step-7 |
| -- | ------ | ------ | ------ | ------ | ------ | ------ | ------ |
| **教学点** | 循环和状态藏在哪 | 跨轮的字段归谁 | 画了圈 ≠ 不让你手作圈 + 闸门归谁写 | 条件分支 vs 边表核对 | 局部变量 vs 输出变量 | 单次 vs 智能体节点 | **人工 ≠ 检查点** |
| **栏数** | 三栏 | 两栏 | 两栏 | 两栏 | 两栏 | 两栏 | 两栏 |
| **左栏** | 手写循环 · 真调 LLM | 会话变量 | 无次数变量（route 兜底） | 条件分支（不拦非法转移） | 写出 outputVars | 单次大模型节点（不传 tools） | 仅人工方块 |
| **中栏** | 智能体应用 · messages 不返 | （无） | （无） | （无） | （无） | （无） | （无） |
| **右栏** | 工作流画布 · 节点/变量可见 | 你自己的 state | 有次数变量（自己写的字段） | 边表核对（declared 边表） | 忘了写 outputVars | 智能体节点（带 tools） | 人工 + checkpoint + idempotency |
| **是否调大模型** | 左 / 中调，右不调 | 都不调 | 都不调 | 都不调 | 都不调 | 都调 | 都不调 |
| **同变体** | —— | 需求 3 跨轮字段 | 需求 4 画圈 / 闸门 | 需求 6 选边 / 边表 | 需求 7 局部变量 / 输出变量 | 需求 5 单次 / 循环 | 需求 9 人工 / 检查点 |