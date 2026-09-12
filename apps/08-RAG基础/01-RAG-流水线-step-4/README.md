# RAG 流水线 · step-4（答准时修法提示 UI · 5 类症状 + 行级/全量/不动库）

对应笔记：[docs/学习模块/08-RAG基础/01-RAG-流水线.md](../../docs/学习模块/08-RAG基础/01-RAG-流水线.md)

## 现在怎么跑

```bash
cd apps
yarn app:08-01-rag-pipeline-step-4
```

浏览器打开 http://127.0.0.1:50070/

端口：`50070`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表同一数字）

## 数据流

```text
左侧建库 / 右侧跑 agent（继承 step-1/2/3）

底部「5 类症状」卡 → 点击「试试此症状」→ 用预设问题跑 agent → 验证症状是否真实出现
```

## 当前能做什么

- 左侧：建库 / 上传 Markdown + PDF / 按 source 整份先删后建 / 多份文件共存（继承 step-2）
- 右侧：跑 agent（手写 while 循环 + MAX_ROUNDS=3，模型自己决定要不要调 search_knowledge，继承 step-3）
- **底部新增 5 张症状卡**（变体 15）：
  1. **库里没有这类知识** → 行级（补文档）→ 不要：全量重建
  2. **库脏（v1 + v2 并存）** → 行级（按 source 先删后建）→ 不要：全量重建
  3. **提示词不够硬** → 不动库（改 system prompt）→ 不要：全量重建
  4. **分数看起来低** → 不动库（先看原文 / 调阈值 / 换问法）→ 不要：换嵌入模型
  5. **同义改写搜不到** → 不动库（query rewrite）→ 不要：全量重建
- 每张卡的「试试此症状」按钮：自动用预设问题跑一次 agent + 把对应症状卡高亮（蓝边蓝底）

## 5 类症状对照表

| # | 典型表现 | 推荐修法 | 不要做 |
| -- | -------- | -------- | ------ |
| 1 | hits=0 或 Top-1 &lt; 0.2 | 行级（补文档） | 全量重建 |
| 2 | 命中里有互相矛盾的内容 | 行级（按 source 先删后建） | 全量重建 |
| 3 | 命中相关但模型没引用 | 不动库（改 system prompt） | 全量重建 |
| 4 | Top-1 = 0.2~0.4 但原文真相关 | 不动库（看原文 / 调阈值） | **换嵌入模型** |
| 5 | 概念上有答案但命中 0 | 不动库（query rewrite） | 全量重建 |

**核心要点**：「答不准 ≠ 一律重跑整库」。99% 的情况都是行级或不动库；全量重建只在切块策略改了 / 嵌入模型换了时才用。

## 上传文件注意事项（同 step-2）

- 支持 `.md`（Markdown）和 `.pdf`（PDF）两种文件
- Markdown 按 `##` 标题分段；PDF 按 3000 字分段（凑合解，跨页段落会断）
- 文件名会成为 `source` 字段入库
- 上传**同名**文件 → 旧版整份被删，新版入库
- 上传**不同名**文件 → 与现有文件共存

行存在 SQLite（`data/chunks.db`），向量是 JSON，检索用余弦排序。`koa-body` + `formidable` 处理文件上传；`pdf-parse` v2 处理 PDF 文本提取。

需要嵌入模型（Embedding Model）。`apps/.env` 可填 `LLM_EMBEDDING_MODEL`；MiniMax / 智谱 / 千问有默认。

agent 循环：`lib/agent/agent-loop.ts`；检索工具：`lib/tools/search-knowledge.ts`；诊断面板：`public/components/diagnose-panel.js`。