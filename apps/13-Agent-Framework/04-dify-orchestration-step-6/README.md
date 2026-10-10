# Dify 等编排产品 · step-6

对应小节：[docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md](../../../docs/学习模块/13-Agent-Framework/04-Dify-等编排产品.md)

**端口**：`50159`（浏览器 [http://127.0.0.1:50159/](http://127.0.0.1:50159/)）

**怎么跑**：`cd apps && yarn app:13-04-dify-orchestration-step-6`

## 现在能做什么

- 首页 `/` 一页两栏对照（同一句用户原话，两栏各发一次独立请求；**都真调大模型**）：
  - **左栏 · 单独一个大模型节点** —— POST /api/llm-node。调一次 LLM（**不传 tools**），拿 finalReply；`rounds=1` · `toolTrace=[]` · `passedTools=false`。
  - **右栏 · 智能体节点** —— POST /api/agent-node。while 循环：调 LLM（**带 tools**：`check_inventory`）→ 调工具（mock 查库存）→ 再调 LLM → finalReply；`rounds ≥ 1` · `toolTrace ≠ []` · `passedTools=true`。
  - 默认用户原话：「来一杯冰拿铁。」（默认库存缺货，右栏必须先查再答）。
- 共用同一句用户原话 + `maxRounds`（1~8，默认 4）。
- 「同时跑两栏」按钮 → 浏览器侧 `Promise.all` 并行发两次独立请求。
- 「演示空入参 4xx」按钮 → POST /api/llm-node { text: "" } → 400 + 红字。
- 「演示后端 5xx」按钮 → GET /api/force-error → 500 + 红字。
- **真调大模型**（§5.3.0 默认）：左 / 右两栏都通过 `apps/llm.ts` 的 `getLlm()` 调 openai Chat Completions；需要 `apps/.env` 配 `LLM_PROVIDER` + `MINIMAX_API_KEY`（或任何支持的提供商 Key）。

## 数据流

```text
页面加载（index.html · ESM 模式 + HTM 写 components）
  GET /health → 填 #env-info（端口 50159 · 协议 A · 会调大模型 · 模型服务商 · 模型 · 密钥）

点「同时跑两栏」（浏览器侧并行）
  POST /api/llm-node  { text, maxRounds: 4 }     ← 左栏独立请求
  POST /api/agent-node { text, maxRounds: 4 }    ← 右栏独立请求
    ↓
  routes/llm-node.ts  → runSingleLLMNode(...)    [lib/flow/llm-node-vs-agent-node.ts]
  routes/agent-node.ts → runSmartAgentNode(...) [lib/flow/llm-node-vs-agent-node.ts]
    ↓
  左：openai.chat.completions.create({ messages, no tools })   → finalReply
  右：openai.chat.completions.create({ messages, tools, tool_choice: "auto" })
    → while：查 → 调工具 → 再调 → ... → finalReply
    ↓
  返回 { rounds, finalReply, toolTrace, passedTools }（右多 rounds ≥ 1 + toolTrace ≠ []）
    ↓
  前端：两栏各自展示「rounds / toolTrace / passedTools / finalReply」
```

## 本步核心

- **`lib/flow/llm-node-vs-agent-node.ts`**：含两个函数 `runSingleLLMNode` 和 `runSmartAgentNode`；共享 `mockToolCheckInventory` + `TOOL_SCHEMAS`。差异只在「传不传 tools」。
- **对照核心**：
  - 左栏 `runSingleLLMNode` —— 调一次（`messages` + **无 tools**），`passedTools=false`，`rounds=1`，`toolTrace=[]`
  - 右栏 `runSmartAgentNode` —— while（`messages` + tools + `tool_choice=auto`），`passedTools=true`，`rounds ≥ 1`，`toolTrace ≠ []`
- **教学点硬钉子**：
  1. 单次大模型节点 ≠ Agent 循环 —— 模型拿到用户原话就返回 finalReply，**不会**自己查库存。
  2. 「它会自动查库存」是对「智能体节点」的脑补，不是对「单独一个大模型节点」的脑补。
  3. 命中「冰拿铁」（库存缺货）时，左栏 finalReply 凭印象可能说「可以做」；右栏 finalReply 看真实库存，必然说「不能做 / 已售罄」。

## 文件结构

```text
04-dify-orchestration-step-6/
├── server.ts                          ← 只装配：bodyParser / mountXxx(router) / serve / listen
├── README.md
├── lib/
│   ├── logger.ts                      ← 拷自顶层 apps/logger.ts（§5.3.12 / §5.3.16 硬规则）
│   ├── http/runtime-ctx.ts            ← 解析 PORT（zod coerce，default 50159）
│   └── flow/
│       └── llm-node-vs-agent-node.ts  ← 本步核心：runSingleLLMNode + runSmartAgentNode（共享 mockToolCheckInventory + TOOL_SCHEMAS）
├── routes/
│   ├── health.ts                      ← GET /health（callsModel: true）
│   ├── llm-node.ts                    ← POST /api/llm-node（左栏）
│   ├── agent-node.ts                  ← POST /api/agent-node（右栏）
│   └── force-error.ts                 ← GET /api/force-error（演示第二类错误）
└── public/
    ├── index.html                     ← ESM 模式骨架 · 两栏对照页
    ├── components/
    │   ├── layout.js                  ← StatusPill / PageIntro / EnvFooter（HTM 写）
    │   ├── page-nav.js                ← 跨页导航（单页 demo + step-1~5 提示）
    │   ├── llm-node-panel.js          ← 左栏面板（黄系）
    │   └── agent-node-panel.js        ← 右栏面板（绿系）
    └── utils/
        └── fetch-json.js              ← postJson / loadHealth
```

## 和 step-1 ~ step-5 的关系

| | step-1 | step-2 | step-3 | step-4 | step-5 | step-6 |
| -- | ------ | ------ | ------ | ------ | ------ | ------ |
| **教学点** | 循环和状态藏在哪 | 跨轮的字段归谁 | 画了圈 ≠ 不让你手作圈 + 闸门归谁写 | 条件分支 vs 边表核对 | 局部变量 vs 输出变量 | 单次 vs 智能体节点 |
| **栏数** | 三栏 | 两栏 | 两栏 | 两栏 | 两栏 | 两栏 |
| **左栏** | 手写循环 · 真调 LLM | 会话变量 | 无次数变量（route 兜底） | 条件分支（不拦非法转移） | 写出 outputVars | 单次大模型节点（不传 tools） |
| **中栏** | 智能体应用 · messages 不返 | （无） | （无） | （无） | （无） | （无） |
| **右栏** | 工作流画布 · 节点/变量可见 | 你自己的 state | 有次数变量（自己写的字段） | 边表核对（declared 边表） | 忘了写 outputVars | 智能体节点（带 tools） |
| **是否调大模型** | 左 / 中调，右不调 | 都不调 | 都不调 | 都不调 | 都不调 | **都调** |
| **同变体** | —— | 需求 3 跨轮字段 | 需求 4 画圈 / 闸门 | 需求 6 选边 / 边表 | 需求 7 局部变量 / 输出变量 | 需求 5 单次 / 循环 |