# Supervisor 模式 · step-1

对应小节：[docs/学习模块/14-Multi-Agent/01-Supervisor-模式.md](../../../docs/学习模块/14-Multi-Agent/01-Supervisor-模式.md)

**端口**：`50162`（浏览器 [http://127.0.0.1:50162/](http://127.0.0.1:50162/)）

**怎么跑**：`cd apps && yarn app:14-01-supervisor-step-1`

## 现在能做什么

- 一次派一个的 Supervisor 模式 + 共享状态（Shared State）—— 客人原话「来一杯中杯热拿铁」走菜单 → 吧台 → 出餐 → finish 共 4 轮，每轮由客户端持有 state 发一次 POST /api/step。
- 输入框填客人原话（默认「来一杯中杯热拿铁」），点「开始这一杯」初始化 SharedState（orderSlip / menuNotes / drinkType / cupLabel / pickupCall / guestReply / round）。
- 「下一步」按钮每点一次 = 一次请求 = 一轮 supervisor round：
  1. 店长 LLM 选 nextWorker（一次只选一个 / 或 finish）
  2. 若不是 finish：调对应工人 LLM（菜单 / 吧台 / 出餐）写 JSON 补丁进 state
  3. 合并成 newState 返回给客户端
  4. 客户端把 newState 存进 React state
- 直到店长选 finish —— 客户端停止发请求，把 guestReply 摆到「给客人的最后一句」卡片里。
- 「演示空 state 4xx」按钮 → POST /api/step { state: {} } → 400 + 红字（第一类错误：入参不合法）。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字（第二类错误）。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 / 模型服务商 / 模型 / 密钥）

点「开始这一杯」
  客户端把 SharedState 初始化好（round=0，订单外字段全 null）
  SharedState = { orderSlip, menuNotes, drinkType, cupLabel, pickupCall, guestReply, round }

点「下一步」（每点一次 = 一轮 round）
  POST /api/step { state }
    ↓
  routes/supervisor.ts → runOneStep({ state }) [lib/flow/supervisor.ts]
    ↓
  ① 店长 LLM：response_format json_schema 选 nextWorker + reasoning
    ② 若 finish：店长 LLM 写 guestReply，state.isFinished=true，不调工人
    ③ 否则：工人 LLM 看自己该看的字段，写 patch → 合并进 newState（round+1）
    ↓
  返回 { ok: true, nextWorker, supervisorReasoning, workerPatch, workerReasoning, newState, isFinished }
    ↓
  客户端把 newState 存进 React state + 把这一轮推入 trace 数组
  页面：state board 刷新 + round trace 卡片多一张

直到 nextWorker === "finish"
  客户端不再发请求
  guestReply 卡片显示店长的最后一句
```

## 本步核心

- **`lib/flow/supervisor.ts` 的 `runOneStep`** —— 一个 round = 一次店长 LLM 调用 + 一次工人 LLM 调用（finish 时只有店长一次）。客户端持有 state，服务端不持任何会话状态。
- **需求 1（一次派一个）**：店长 LLM 的 `nextWorker` enum 必须是 menu / brew / serve / finish 之一，不能一次选多个。
- **需求 4（共享状态）**：工人 LLM 的系统提示词只填自己该看的字段（菜单员只看 orderSlip；吧台员只看 orderSlip + menuNotes + drinkType；出餐员只看 orderSlip + cupLabel）。工人不偷看无关字段，也读不到其他工人的内部 LLM 来回。

## 文件结构

```text
01-Supervisor-模式-step-1/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50162）
│   └── flow/
│       └── supervisor.ts              ← 本步核心：runOneStep({ state }) —— 一次 round
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── supervisor.ts                  ← POST /api/step（一个业务 URL 一个文件）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 单步交互页
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo）
    │   ├── state-board.js             ← 共享状态板（HTM 写）
    │   └── round-trace.js             ← 每轮轨迹卡（HTM 写）
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```
