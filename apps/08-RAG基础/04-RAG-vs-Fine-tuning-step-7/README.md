# 模块 08 · 04 · RAG vs Fine-tuning · 第七步（step-7）

## 跑入口

```bash
cd apps
yarn app:08-04-rag-vs-fine-tuning-step-7
```

端口：**50086**（主源 = `apps/package.json` 脚本里 inline 的 `PORT=50086`）。
浏览器：`http://127.0.0.1:50086/`

## 跑什么

本 step 是**混合 pipeline 综合 demo** —— 同一道题、同一模型，**事实层（corpus）+ 口吻层（system）各管各的**：

| sub-page | 端点 | 演示 |
| -- | -- | -- |
| [/pages/full-pipeline.html](/pages/full-pipeline.html) | POST /api/full-pipeline | 同一道题 + 3 种 system 模板（empty / fewshot / brand）+ 改 corpus → 看「事实 / 口吻 / 答复 / 依据」4 条信息 |

## 数据流```text
浏览器加载 http://127.0.0.1:50086/
  → public/index.html 总览（1 个 sub-page 入口 + PageNav）
  → 跳到 /pages/full-pipeline.html（共享 50086 端口）

/pages/full-pipeline.html
  ├─ 选 system 模板（empty / fewshot / brand）
  ├─ 点「改成 N 天」→ POST /api/corpus-edit，body = action=set, days=N
  │     → routes/corpus-edit.ts → lib/rag/corpus.ts addAnnouncement() → corpus 改为「调整为 N 天」
  ├─ 点「跑 pipeline」→ POST /api/full-pipeline
  │     → routes/full-pipeline.ts → lib/flow/full-pipeline.ts
  │           ├─ lib/rag/search.ts（基于**当前** corpus 实时建索引）
  │           ├─ 选 system 模板（empty / fewshot / brand 之一）
  │           └─ llm.openai.chat.completions.create(...)
  └─ 显示「事实层（corpus 原文）+ 口吻层（system 模板描述）+ 答复 + 依据」
```

## 当前能做什么

**3 种 system 模板 × 改 corpus 演示「事实 + 口吻」两路各管各的**：

- **default**：system=brand，corpus=「调整为 3 天」→ 答「三天 + 道歉 + 列依据」
- **改 corpus**：改成 7 天 → 答「七天 + 道歉 + 列依据」（事实跟变）
- **换 system**：换成 empty → 答「七天 + 无口吻」（口吻跟变）

## 本步核心

- `lib/flow/full-pipeline.ts`：本步核心 —— 检索（可变 corpus）+ 拼 system（3 种模板）+ 调模型
- `lib/rag/corpus.ts`：可变语料（addAnnouncement / resetAnnouncement）
- `lib/rag/search.ts`：检索 —— 每次调用基于**当前 corpus**实时建索引
- 主流程**单独成文件**（§5.3.8）；route 只校验入参 → 调核心 → 写 ctx.body

## 教学点

- **混合 = 事实层（corpus）+ 口吻层（system）各管各的** —— 改 corpus → 事实跟变；换 system → 口吻跟变；两路互不干扰
- **跟 step-5 mix sub-page 的差异**：step-5 mix 是单一 system 演示；step-7 是 3 种 system 模板可切的综合 demo
- **跟 step-6 的关系**：step-6 演示「该不该检索」；step-7 演示「已决定检索 + 加 system」

## 对应学习沉淀

[docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md](../../docs/学习模块/08-RAG基础/04-RAG-vs-Fine-tuning.md)

本 step 对应 MD 需求 5「混合」的综合 demo。step-1~6 已固化需求 1 / 2 / 3 / 4 / 6 / 7 / 8 / 10 / 11 / 12 / 13 / 14 / 变体 9。

## 与 step-5 的差异（增量构建）

step-7 = **独立新文件夹**（不复用 step-5 mix sub-page 代码）：
- step-5 mix sub-page 单一 system；step-7 full-pipeline 3 种 system 模板
- step-7 把「事实层 / 口吻层」分别显示在 UI 上（让学习者直接对照两路）

## 锁定时机

按 [AGENTS.md §5.3.14](https://…/agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)：step-N 是工作区，自由打磨；学习者主动说「锁定」那一刻才校验 §5.3.2 6 项 + `node scripts/check-demo.cjs` 过 + `cd apps && yarn typecheck` 过。**未锁定前可改可重构**。