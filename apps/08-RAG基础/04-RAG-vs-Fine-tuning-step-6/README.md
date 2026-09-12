# 模块 08 · 04 · RAG vs Fine-tuning · 第六步（step-6）

## 跑入口

```bash
cd apps
yarn app:08-04-rag-vs-fine-tuning-step-6
```

端口：**50085**（主源 = `apps/package.json` 脚本里 inline 的 `PORT=50085`）。
浏览器：`http://127.0.0.1:50085/`

## 跑什么

本 step 是「『该不该检索』的三种流程」—— 3 个 sub-page 共享同一端口 50085，每个 sub-page 演示一种决策模式：

| sub-page | 决策模式 | 端点 | 流程 |
| -- | -- | -- | -- |
| [/pages/routing-rules.html](/pages/routing-rules.html) | **路由层规则** | POST /api/chat-routing | 关键词正则匹配 → 命中即检索 / 否则直接答 |
| [/pages/threshold.html](/pages/threshold.html) | **命中阈值** | POST /api/chat-threshold | 总是检索 → top1 score > threshold 才用 / 否则弃权 |
| [/pages/agent-decide.html](/pages/agent-decide.html) | **agent loop**（模型自己决定）| POST /api/chat-agent | 先让模型答 yes/no → yes 检索 / no 直接答 |

## 数据流```text
浏览器加载 http://127.0.0.1:50085/
  → public/index.html 总览（3 个 sub-page 入口 + PageNav）
  → 跳到 /pages/routing-rules.html（共享 50085 端口）

/pages/routing-rules.html（流程 1 · 路由层规则）
  ├─ 用户输入问句 → POST /api/chat-routing
  │     → routes/chat-routing.ts → lib/flow/judge-routing-rules.ts
  │           ├─ POLICY_KEYWORDS 正则匹配
  │           ├─ 命中 → 检索分支（search + llm 按材料答）
  │           └─ 不命中 → 直接答分支（只调 llm 寒暄）
  └─ 显示 branch + reason + answer

/pages/threshold.html（流程 2 · 命中阈值）
  └─ 用户输入问句 + threshold → POST /api/chat-threshold
        → routes/chat-threshold.ts → lib/flow/judge-threshold.ts
              ├─ 总是检索
              ├─ top1 score > threshold → 按材料答
              └─ top1 score <= threshold → 弃权（按指令答「库里没有」）

/pages/agent-decide.html（流程 3 · 模型自己决定）
  └─ 用户输入问句 → POST /api/chat-agent
        → routes/chat-agent.ts → lib/flow/judge-agent.ts
              ├─ 第一跳：让模型答 yes/no
              ├─ yes → 检索分支（search + llm 按材料答）
              └─ no → 直接答分支（只调 llm 寒暄）
```

## 当前能做什么

**同一道题 → 三个 sub-page 三种判断 → 看 branch / reason / modelSaid**：

- 「你好」→ 路由层：不命中 → 直接答；阈值：top1 score ~0 → 弃权；agent：modelSaid=no → 直接答
- 「现在还能七天无理由退货吗？」→ 路由层：命中 → 检索；阈值：top1 score ~0.5 → 按材料答；agent：modelSaid=yes → 检索
- 反复试不同问句，看三种判断的差异

## 本步核心

- `lib/flow/judge-routing-rules.ts`：核心 1 —— 路由层规则（正则匹配）
- `lib/flow/judge-threshold.ts`：核心 2 —— 命中阈值（top1 score 阈值判断）
- `lib/flow/judge-agent.ts`：核心 3 —— agent loop（模型自己决定）
- 主流程**单独成文件**（§5.3.8）；route 只校验入参 → 调核心 → 写 ctx.body

## 对应学习沉淀

[docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md](../../docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md)

本 step 对应 MD 需求 6「不该检索」的「流程」补完：流程 1/2/3 三种判断模式。step-5 演示了「端点」（手动选检索 vs 直接答），step-6 演示「同一端点内部判断该走哪个分支」。

## 与 step-5 的差异（增量构建）

step-6 = **独立新文件夹**（不复用 step-5 代码）：
- step-5 演示「端点」（no-rag / rag-mix / corpus-edit 三独立端点）；step-6 演示「端点内部判断」（chat-routing / chat-threshold / chat-agent 三端点，内部判断走哪个分支）
- 共享同一端口 50085（§5.3.14 例外「当前 step 加页面 + 导航承接」）

## 锁定时机

按 [AGENTS.md §5.3.14](https://…/agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)：step-N 是工作区，自由打磨；学习者主动说「锁定」那一刻才校验 §5.3.2 6 项 + `node scripts/check-demo.cjs` 过 + `cd apps && yarn typecheck` 过。**未锁定前可改可重构**。