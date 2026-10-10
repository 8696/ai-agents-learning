# Orchestrator-Workers · step-2

对应小节：[docs/学习模块/14-Multi-Agent/01-Supervisor-模式.md](../../../docs/学习模块/14-Multi-Agent/01-Supervisor-模式.md)

**端口**：`50163`（浏览器 [http://127.0.0.1:50163/](http://127.0.0.1:50163/)）

**怎么跑**：`cd apps && yarn app:14-01-orchestrator-workers-step-2`

## 现在能做什么

- 一次发请求，跑完三段流水线 —— 客人问「热拿铁、冰美式、燕麦拿铁，今天都能做吗？」，服务端跑：
  1. **编排者 LLM**：把这一句话拆成 3 个互不依赖的「查菜单」子任务
  2. **3 个菜单员 LLM**：走 `Promise.all` 并行查 cafe://today-menu，每杯一份
  3. **汇总者 LLM**：把 3 份结果拼成一段给客人的最终答复
- 输入框填客人原话（默认「热拿铁、冰美式、燕麦拿铁，今天都能做吗？」），点「运行编排者」= 一次 POST /api/orchestrator
- 页面展示三段卡片 + 每段耗时：
  - ① 编排者（拆出 N 个子任务 + reasoning）
  - ② N 个菜单员并行（每个一个进度条，按各自耗时比例；右上角 max vs sum 数字直接看并行节省的时间）
  - ③ 汇总者（guestReply + reasoning）
- 「演示空 orderSlip 4xx」按钮 → POST /api/orchestrator { orderSlip: "" } → 400 + 红字（第一类错误：入参不合法）。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字（第二类错误）。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 / 模型服务商 / 模型 / 密钥）

点「运行编排者」
  POST /api/orchestrator { orderSlip }
    ↓
  routes/orchestrator.ts → runOrchestrator({ orderSlip }) [lib/flow/orchestrator.ts]
    ↓
  ① 编排者 LLM：response_format json_schema + 拆 N 个子任务 { drink }
  ② Promise.all N 个菜单员 LLM（每个独立 json_schema；各自打耗时）
  ③ 汇总者 LLM：把 N 份拼成 guestReply
    ↓
  返回 { ok: true, state, stages: { orchestrator, workers, aggregator }, totalElapsedMs }
    ↓
  页面：三段卡片按顺序亮出来 + 总耗时 + max vs sum 对照数字
```

## 本步核心

- **`lib/flow/orchestrator.ts` 的 `runOrchestrator`** —— 编排者一次「拆 + 并行 + 汇总」三段，对照 step-1 的「一次派一个 + 多次 round」。客户端一次发请求，服务端串起三段 LLM 调用（中间一段走 `Promise.all` 并行）。
- **需求 2（编排者-工人）**：编排者用 LLM 判依赖（不是硬编码 if orderSlip.includes("、") 之类）；N 个菜单员真并行（不是顺序循环）；汇总者把 N 份完整结果拼成一段。
- **对照 step-1**：step-1 的「一次派一个」总耗时 = sum(rounds × model_latency)；step-2 的「拆 + 并行 + 汇总」总耗时 = orchestrator + max(N × worker_latency) + aggregator。N 越大，节省越明显。

## 文件结构

```text
01-Supervisor-模式-step-2/
├── server.ts                              ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                          ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts                ← 解析 PORT（zod coerce，default 50163）
│   └── flow/
│       ├── orchestrator.ts                ← 本步核心：runOrchestrator({ orderSlip })
│       ├── prompts.ts                     ← 编排者 + 菜单员 + 汇总者 三段系统提示词
│       ├── schemas.ts                     ← 三段 zod schema + safeJsonParse（含 <think> / ``` 围栏剥除）
│       └── types.ts                       ← OrchestratorState + WorkerTrace + OrchestratorOutput
├── routes/
│   ├── health.ts                          ← GET /health
│   ├── orchestrator.ts                    ← POST /api/orchestrator（一个业务 URL 一个文件）
│   └── force-error.ts                     ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                         ← ESM 模式骨架 · 单页交互
    ├── components/
    │   ├── layout.js                      ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                    ← 跨页导航（单页 demo）
    │   └── orchestrator-panel.js          ← 三段流水线卡片 + max vs sum 对照（HTM 写）
    └── utils/
        └── fetch-json.js                  ← postJson / loadHealth
```
