# 模块 08 · 04 · RAG vs Fine-tuning · 第四步（step-4）

## 跑入口

```bash
cd apps
yarn app:08-04-rag-vs-fine-tuning-step-4
```

端口：**50083**（主源 = `apps/package.json` 脚本里 inline 的 `PORT=50083`）。
浏览器：`http://127.0.0.1:50083/`

## 数据流```text
浏览器加载页面
  └─ useEffect → fetch("/api/data-shape")
        └─ routes/data-shape.ts
              ├─ lib/data-shape/doc-corpus.ts（4 段 refund-v2.md 文档）
              └─ lib/data-shape/qa-corpus.ts（5 条客服问答对）
        → ctx.body = { docs, qas }
        → 前端左栏 DocCard · 右栏 QaCard 渲染
```

**本步不调 LLM（§5.3.0 例外「纯 UI 渲染层演示」）。**

## 当前能做什么

同一页、左栏 vs 右栏并排展示：

- **左栏**：4 段 refund-v2.md 文档段落（陈述事实的原文）—— **检索增强生成喂的**
- **右栏**：5 条「用户问 → 理想答」客服问答对（带品牌口吻）—— **微调喂的**

→ 一眼看出两者的形态差异：文档 =「来源 / 章节 / 段落」结构；问答对 =「用户 + 理想答」结构。

## 本步核心

- `lib/data-shape/doc-corpus.ts`：文档段落示例（陈述事实的原文）
- `lib/data-shape/qa-corpus.ts`：客服问答对示例（带口吻）
- 两条**独立成文件**：方便后续 step 改 / 加 / 删一种数据而不影响另一种
- `routes/data-shape.ts`：GET /api/data-shape → 返回两份示例
- `routes/demo-error.ts`：GET /api/demo-error → 故意 5xx（§5.3.2 #2 第二类错误演示）

## 教学点

- 「文档 vs 问答对」**不能互相代替**：
  - 反例 1：把手册直接当微调数据 → 模型只学到「复述手册」，不是「按客服流程答」
  - 反例 2：把客服聊天记录不当清洗当检索文档 → 库里进一堆「好的亲」 + 过期承诺

## 对应学习沉淀

[docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md](../../docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md)

本 step 对照 MD 需求 10「数据形态：文档 ≠ 问答对」。step-1 / step-2 / step-3 已固化需求 1 / 2 / 4 / 7 / 8。

## 与 step-1 的差异（增量构建）

step-4 = **独立新文件夹**（不复用 step-3 代码 —— step-3 演示调模型，step-4 不调）：
- 不写 `lib/flow/*`、`lib/rag/search.ts`、`routes/no-rag.ts`、`routes/rag.ts`
- 加 `lib/data-shape/{doc-corpus,qa-corpus}.ts`、`routes/data-shape.ts`、`routes/demo-error.ts`
- 改 `public/components/layout.js`（页脚端口 + 「本地展示（不调 LLM）」文案）
- 改 `public/components/compare-summary.js`（加 reload + demo-error 按钮）
- 改 `public/index.html`（用 DocCard + QaCard + CompareSummary）

## 锁定时机

按 [AGENTS.md §5.3.14](https://…/agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)：step-N 是工作区，自由打磨；学习者主动说「锁定」那一刻才校验 §5.3.2 6 项 + `node scripts/check-demo.cjs` 过 + `cd apps && yarn typecheck` 过。**未锁定前可改可重构**。