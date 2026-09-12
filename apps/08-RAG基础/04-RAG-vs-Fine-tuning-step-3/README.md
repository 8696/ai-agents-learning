# 模块 08 · 04 · RAG vs Fine-tuning · 第三步（step-3）

## 跑入口

```bash
cd apps
yarn app:08-04-rag-vs-fine-tuning-step-3
```

端口：**50082**（主源 = `apps/package.json` 脚本里 inline 的 `PORT=50082`）。
浏览器：`http://127.0.0.1:50082/`

## 数据流```text
浏览器输入一道「库里没有」的题（默认「我们公司有没有内部折扣码？」）
  ├─ 左栏 [POST /api/no-rag]      → routes/no-rag.ts
  │     └─ lib/flow/answer-without-rag.ts（只调模型，无材料，无出处）
  │           └─ llm.openai.chat.completions.create(...)
  │           → 模型按角色硬编一个（如「VIP8 折」）
  │
  ├─ 右栏 [POST /api/rag]         → routes/rag.ts
  │     └─ lib/flow/answer-with-rag.ts（search → 拼提示词 → 调模型）
  │           ├─ lib/rag/search.ts（toy 词袋 + 余弦，命中 0 条相关切块）
  │           ├─ system 含「找不到就说『库里没有』」指令
  │           └─ llm.openai.chat.completions.create(...)
  │           → 模型按指令答「库里没有这条信息，我不能编」
  │
  └─ [同时跑两栏] 浏览器 Promise.all([fetch /api/no-rag, fetch /api/rag])
```

## 当前能做什么

同一道**库里没有**的题、两条独立请求对照：

- **左栏（不接 RAG · model only · 无材料 · 无出处）**：模型按训练时的常识 / 印象回答 → **可能凭空编一个（无依据）**
- **右栏（检索增强生成）**：检索 0 条相关切块 + system 指令「找不到就说『库里没有』」 → **按指令弃权**

→ 演示「幻觉 vs 弃权」的本体：检索增强生成不是「给更多知识」，而是「找不到时给一条指令，让模型别编」。

## 本步核心

- 本步核心 1 = `lib/flow/answer-without-rag.ts`（step-1 锁定版不动）
- 本步核心 2 = `lib/flow/answer-with-rag.ts`（step-1 锁定版不动）
- **本步不写新代码**：复用 step-1 锁定版本的全部文件；只改默认 question + 页面文案

## 教学点

- 「训练截止后的旧事实」（step-1 / step-2 演示的）≠「幻觉」（本步演示的）
  - 训练截止后的旧事实：模型不知道新事 → 按旧事实答
  - 幻觉：模型凭空编一个听起来很官方的答案
- 检索增强生成的真正价值不只是「给材料」，还有「给一条弃权指令」

## 对应学习沉淀

[docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md](../../docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md)

本 step 对照 MD 需求 8「幻觉 / 库里没有」+ 需求 7「不该微调灌事实」（反例演示）。子-2 / 子-1 已固化需求 1 + 2 + 4。

## 与 step-1 的差异（增量构建）

step-3 = **copy 锁定的 step-1**（不要从 step-2 复制，step-2 没有 no-rag 端点）+ 改默认 question + 改页面文案。

- 改 `lib/http/runtime-ctx.ts`（default 50080 → 50082）
- 改 `public/components/layout.js`（页脚端口）
- 改 `public/index.html`（默认 question + 教学点文案）
- 改 `public/components/compare-summary.js`（核心教学点卡片）
- **不动**：`lib/flow/*`、`lib/rag/*`、`routes/*`、`server.ts`（除 `server.start` 文案）

## 锁定时机

按 [AGENTS.md §5.3.14](https://…/agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)：step-N 是工作区，自由打磨；学习者主动说「锁定」那一刻才校验 §5.3.2 6 项 + `node scripts/check-demo.cjs` 过 + `cd apps && yarn typecheck` 过。**未锁定前可改可重构**。