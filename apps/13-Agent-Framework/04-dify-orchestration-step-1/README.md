# Dify 等编排产品 · step-1

对应小节：[docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md](../../../docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md)

**端口**：`50154`（浏览器 [http://127.0.0.1:50154/](http://127.0.0.1:50154/)）

**怎么跑**：`cd apps && yarn app:13-04-dify-orchestration-step-1`

## 现在能做什么

- 首页 `/` 一页三栏对照（同一句输入，三栏各自跑各自的一次请求）：
  - **左栏 · 手写循环** —— POST /api/handwritten-loop，真调大模型（协议 A · openai Chat Completions），返回完整 messages 数组 + 圈数 + 工具轨迹。**对照模块 07 的 while + 调大模型 + 调工具**。
  - **中栏 · 智能体应用** —— POST /api/agent-app，调的是**同一个 while + 同一个调 LLM**，但服务端只返 `{ roundsHidden, finalReply, toolTrace }`（messages 数组不返）—— 模拟"产品在背后转圈但你看不到圈"。完整 messages 留在 `apps/13-Agent-Framework/04-dify-orchestration-step-1/logs/` 里。
  - **右栏 · 工作流画布** —— POST /api/workflow，不调大模型（§5.3.0 例外「纯协议形状 / UI 渲染层演示」），返回固定画布的节点图 + 变量面板 + 灰显「调度器 / 状态类型 / 边表核对 不在仓库里」。
- 共用一个输入框（一句用户原话，默认「来一杯中杯热拿铁。」），三栏共用同一句做对照。
- 「演示空入参 4xx」按钮 → POST /api/handwritten-loop { text: "" } → 400 + 红字（第一类错误：入参不合法）。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字（第二类错误）。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 / 模型服务商 / 模型 / 密钥 / 是否会调大模型）

点「跑手写循环」（左栏按钮）
  POST /api/handwritten-loop { text, maxRounds: 4 }
    ↓
  routes/handwritten-loop.ts → runLoop({ exposeMessages: true }) [lib/flow/handwritten-loop.ts]
    ↓
  while：messages 追加 → 调 openai.chat.completions → 模型若要 tool_calls → 模拟工具 → 再调 → ...
    ↓
  返回 { messages, rounds, finalReply, toolTrace, modelCalls, stoppedReason }
    ↓
  前端：左栏 messages 列表逐条增长；圈数 + 终止原因 + finalReply 上页

点「跑智能体应用」（中栏按钮）
  POST /api/agent-app { text, maxRounds: 4 }
    ↓
  routes/agent-app.ts → runAsAgentApp(text, maxRounds) [lib/flow/agent-app.ts]
    ↓
  内部调 runLoop({ exposeMessages: false }) —— **同一个 while**，但消息数组不返
    ↓
  返回 { roundsHidden, finalReply, toolTrace, modelCalls, stoppedReason }
    ↓
  前端：中栏只露「产品内部转了几圈 + finalReply」；messages 数组灰显「归产品」

点「画工作流画布」（右栏按钮）
  POST /api/workflow { text }
    ↓
  routes/workflow.ts → runWorkflowMock(text) [lib/flow/workflow.ts] —— **不调大模型**
    ↓
  返回固定画布：{ nodes, edges, variables, hiddenMechanism }
    ↓
  前端：节点图（ASCII）+ 变量面板 + 灰显「调度器 / 状态类型 / 边表核对」藏在产品里
```

## 本步核心

- **左栏 + 中栏共用 `lib/flow/handwritten-loop.ts` 的 `runLoop`**（一个 while，两横分别手写 vs 产品展示）。
- **`exposeMessages` 参数** 是这一小节的对照核心：左栏 true / 中栏 false —— 同一段 while，两种对外形状。
- **`lib/flow/workflow.ts` 不调大模型**（§5.3.0 例外）：画布对照是"看见 vs 看不见"的对照，不是真跑图。

## 文件结构

```text
04-dify-orchestration-step-1/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50154）
│   └── flow/
│       ├── handwritten-loop.ts        ← 本步核心（左栏 + 中栏共用）：runLoop(exposeMessages)
│       ├── agent-app.ts               ← 中栏包装：runAsAgentApp(text, maxRounds)
│       └── workflow.ts                ← 右栏静态对照：runWorkflowMock(text)
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── handwritten-loop.ts            ← POST /api/handwritten-loop（左栏）
│   ├── agent-app.ts                   ← POST /api/agent-app（中栏）
│   ├── workflow.ts                    ← POST /api/workflow（右栏）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 三栏对照页
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo）
    │   ├── loop-panel.js              ← 左栏面板
    │   ├── agent-app-panel.js         ← 中栏面板
    │   └── workflow-panel.js          ← 右栏面板
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```

## 和「伪代码」原结论的关系

小节文档 `## Demo 判断` 段原写「**伪代码**，不建 apps/，不占端口」—— 理由是「**再在 apps/ 里仿造一个 Dify，会把体验项做成主线**」。

本 step **没有**仿造 Dify 内部机制 —— 这页的 demo 是把文档里「**同一句热拿铁，三种走法**」做成**可视化对照**，让学习者一眼看清：
- 左栏 = 手写循环（对照模块 07，**不是仿造产品**）
- 中栏 = 智能体应用（同样的 while，但 messages 数组**不返**；messages 仍在服务端 logs/）
- 右栏 = 工作流画布（不调大模型；节点 / 变量可见，调度器 / 状态类型 / 边表核对**不**在仓库）

所以原结论反对的是"**仿造 Dify 内部**"；本 step 是"**对照三种走法在循环和状态上的差异**"。两件事不冲突，结论改成「**可运行**」。