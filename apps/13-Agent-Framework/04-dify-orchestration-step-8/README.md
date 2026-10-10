# Dify 等编排产品 · step-8

对应小节：[docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md](../../../docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md)

**端口**：`50161`（浏览器 [http://127.0.0.1:50161/](http://127.0.0.1:50161/)）

**怎么跑**：`cd apps && yarn app:13-04-dify-orchestration-step-8`

## 现在能做什么

- 首页 `/` 一页两栏对照（同一句 query，两栏各发一次独立请求；**都不调大模型**）：
  - **左栏 · 知识库节点** —— POST /api/kb-node。拖一个 KB 检索节点：调一次 mock KB → 拿到 top-1 → 输出；`rounds=1` · `hasLoop=false`。
  - **右栏 · Agent 循环节点** —— POST /api/agent-node-with-kb。while：调 KB → 模型看 KB → 再调 KB → 调 LLM 汇总；`rounds=3` · `hasLoop=true`。
  - 默认 query：「热拿铁能做吗」。
- 共用同一句 query。
- mock KB 库 5 条：热拿铁能做吗 / 冰拿铁能做吗 / 退款流程 / 营业时间 / 杯型大小。
- 「同时跑两栏」按钮 → 浏览器侧 `Promise.all` 并行发两次独立请求。
- 「演示空入参 4xx」按钮 → POST /api/kb-node { query: "" } → 400 + 红字。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。
- **不调大模型**（§5.3.0 例外「纯协议形状 / UI 演示」）：脚本 mock KB 库 + 模拟两栏对照。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 50161 · 本地计算 · 不调大模型）

点「同时跑两栏」（浏览器侧并行）
  POST /api/kb-node            { query }   ← 左栏独立请求
  POST /api/agent-node-with-kb { query }   ← 右栏独立请求
    ↓
  routes/kb-node.ts            → runKBNode(...)            [lib/flow/kb-node-vs-agent-node.ts]
  routes/agent-node-with-kb.ts → runAgentNodeWithKB(...) [lib/flow/kb-node-vs-agent-node.ts]
    ↓
  左：mockKBSearch → top-1 → 输出      右：while（KB + KB + LLM 汇总）→ 输出
    ↓
  返回 { rounds, hasLoop, finalReply, turns, stoppedReason }
    ↓
  前端：两栏各自展示「rounds + hasLoop + 终止原因 + turns + finalReply」
```

## 本步核心

- **`lib/flow/kb-node-vs-agent-node.ts`**：含两个函数 `runKBNode` 和 `runAgentNodeWithKB`；共享 `MOCK_KB` 5 条 + `mockKBSearch`（简单关键字匹配）+ `mockLLMSummarize`。差异只在「带不带循环」。
- **对照核心**：
  - 左栏 `runKBNode` —— 调一次 mock KB → 拿到 top-1 → 输出；`rounds=1` · `hasLoop=false`
  - 右栏 `runAgentNodeWithKB` —— while：调 KB + 调 KB + 调 LLM 汇总；`rounds=3` · `hasLoop=true`
- **教学点硬钉子**：
  1. 拖一个知识库节点 ≠ Agent 循环 —— 知识库节点 = 检索那一跳，调一次就停
  2. 「它会自己循环查资料」是对「Agent 循环节点」的脑补，不是对「知识库节点」的脑补
  3. 知识库节点和 Agent 循环节点在画布上看起来都是方块 —— 但内部机制完全不一样

## 文件结构

```text
04-dify-orchestration-step-8/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50161）
│   └── flow/
│       └── kb-node-vs-agent-node.ts  ← 本步核心：runKBNode + runAgentNodeWithKB（共享 mockKBSearch + MOCK_KB）
├── routes/
│   ├── health.ts                      ← GET /health
│   ├── kb-node.ts                     ← POST /api/kb-node（左栏）
│   ├── agent-node-with-kb.ts          ← POST /api/agent-node-with-kb（右栏）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 两栏对照页
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo + step-1~7 提示）
    │   └── kb-panel.js                ← 共享面板（通过 props.title + props.hasLoop 区分）
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```