# 模块 08 · 04 · RAG vs Fine-tuning · 第一步（step-1）

## 跑入口

```bash
cd apps
yarn app:08-04-rag-vs-fine-tuning-step-1
```

端口：**50080**（主源 = `apps/package.json` 脚本里 inline 的 `PORT=50080`）。
浏览器：`http://127.0.0.1:50080/`

## 数据流```text
浏览器输入问题
  ├─ 左栏 [POST /api/no-rag]      → routes/no-rag.ts
  │     └─ lib/flow/answer-without-rag.ts（只调模型，无材料）
  │           └─ llm.openai.chat.completions.create(...)
  │
  ├─ 右栏 [POST /api/rag]         → routes/rag.ts
  │     └─ lib/flow/answer-with-rag.ts（search → 拼提示词 → 调模型）
  │           ├─ lib/rag/search.ts（toy 词袋 + 余弦）
  │           └─ llm.openai.chat.completions.create(...)
  │
  └─ [同时跑两栏] 浏览器 Promise.all([fetch /api/no-rag, fetch /api/rag])
        —— 两条独立请求；不是 /api/compare 打包跑多轨迹
```

## 当前能做什么

同一问句、两条独立请求，左栏「只靠模型」vs 右栏「检索增强生成」并排对照：

- **左栏**：模型用训练时的常识 / 印象答，无出处。对照演示「知识改的时候不检索就跟不上」。
- **右栏**：从内置「退款政策 v2」语料里命中切块（9 月 1 日改成三天），按材料说话并列出文件 / 章节 / chunkId。
- **本步没有训练任务**——微调（Fine-tuning）按 MD 边界在本步不真训。

## 本步核心

- 本步核心 1 = `lib/flow/answer-with-rag.ts`：检索 → 拼提示词 → 调模型 → 返回带出处
- 本步核心 2 = `lib/flow/answer-without-rag.ts`：只调模型，无材料，无出处
- 主流程**单独成文件**（§5.3.8）；route 只校验入参 → 调核心 → 写 ctx.body

## 对应学习沉淀

[docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md](../../docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md)

本 step 对照 MD 例子 3「售后：七天改三天」+ 需求 1（知识常变）+ 需求 2（要引用）。其余10 条需求留到后续 step。

## 锁定时机

按 [AGENTS.md §5.3.14](https://…/agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)：step-N 是工作区，自由打磨；学习者主动说「锁定」那一刻才校验 §5.3.2 6 项 + `node scripts/check-demo.cjs` 过 + `cd apps && yarn typecheck` 过。**未锁定前可改可重构**。