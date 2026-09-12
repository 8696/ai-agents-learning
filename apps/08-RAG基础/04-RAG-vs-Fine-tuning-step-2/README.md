# 模块 08 · 04 · RAG vs Fine-tuning · 第二步（step-2）

## 跑入口

```bash
cd apps
yarn app:08-04-rag-vs-fine-tuning-step-2
```

端口：**50081**（主源 = `apps/package.json` 脚本里 inline 的 `PORT=50081`）。
浏览器：`http://127.0.0.1:50081/`

## 数据流```text
浏览器输入一道投诉
  ├─ 左栏 [POST /api/rag-empty]      → routes/rag-empty.ts
  │     └─ lib/flow/answer-with-rag.ts(promptVariant="empty")
  │           ├─ lib/rag/search.ts（toy 词袋 + 余弦）
  │           ├─ lib/rag/fewshot-templates.ts（buildEmptySystemPrompt）
  │           └─ llm.openai.chat.completions.create(...)
  │
  ├─ 右栏 [POST /api/rag-fewshot]    → routes/rag-fewshot.ts
  │     └─ lib/flow/answer-with-rag.ts(promptVariant="fewshot")
  │           ├─ lib/rag/search.ts（同一份检索材料）
  │           ├─ lib/rag/fewshot-templates.ts（buildFewshotSystemPrompt）
  │           └─ llm.openai.chat.completions.create(...)
  │
  └─ [同时跑两栏] 浏览器 Promise.all([fetch /api/rag-empty, fetch /api/rag-fewshot])
        —— 两条独立请求；不是 /api/rag-compare 打包跑多轨迹
```

## 当前能做什么

同一问句、同一份检索材料、两条独立请求，左栏「空系统提示词 + RAG」vs 右栏「带 3 条品牌范例 + RAG」并排对照：

- **左栏**：模型按「你是售后客服助手。请按材料回答」自由发挥口吻 → 经常直接给结论、没说依据
- **右栏**：模型按品牌口吻约定（先道歉 / 再结论 / 再依据）+ 3 条范例 → 更接近「先道歉再结论」的结构

→ 一眼看出「口吻差不是来自模型能力，差在系统提示词」。

## 本步核心

- 本步核心 = `lib/flow/answer-with-rag.ts`：检索 → 拼 system（按 promptVariant 选空 / 范例模板）→ 调模型 → 返回带出处
- 主流程**单独成文件**（§5.3.8）；route 只校验入参 → 调核心 → 写 ctx.body
- `lib/rag/fewshot-templates.ts`：3 条品牌范例 + 品牌口吻约定（**独立成文件**，方便后续 step 改）

## 对应学习沉淀

[docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md](../../docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md)

本 step 对照 MD 需求 4「先试提示词（第三条路）」。step-1 已固化需求 1 + 2。

## 与 step-1 的差异（增量构建）

step-2 = 复制 step-1 锁定版本 + 增量：
- 新加 `lib/rag/fewshot-templates.ts`（3 条范例 + buildEmpty/buildFewshot 两套 system 模板）
- 改 `lib/flow/answer-with-rag.ts`（入参加 promptVariant）
- 新加 `routes/rag-empty.ts` + `routes/rag-fewshot.ts`（语义分明的两条独立 URL）
- 删除 step-1 的 `routes/no-rag.ts` + `routes/rag.ts`（step-2 不演示「无材料 vs 有材料」对照）
- 新加 `public/components/prompt-empty-card.js` + `public/components/prompt-fewshot-card.js`

## 锁定时机

按 [AGENTS.md §5.3.14](https://…/agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)：step-N 是工作区，自由打磨；学习者主动说「锁定」那一刻才校验 §5.3.2 6 项 + `node scripts/check-demo.cjs` 过 + `cd apps && yarn typecheck` 过。**未锁定前可改可重构**。