# RAG 流水线 · step-3（检索做成工具 · Agent 最小循环）

对应笔记：[docs/学习模块/08-RAG基础/01-RAG-流水线.md](../../docs/学习模块/08-RAG基础/01-RAG-流水线.md)

## 现在怎么跑

```bash
cd apps
yarn app:08-01-rag-pipeline-step-3
```

浏览器打开 http://127.0.0.1:50069/

端口：`50069`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表同一数字）

## 数据流

```text
左边建库（仍走 step-2 的按 source 整份先删后建）
  POST /api/ingest 或 /api/ingest-upload ─► 加载 → 切块 → 向量化 → deleteBySource(filename) → addChunks
  GET /api/store-sources ─► 看库里 N 份不同 source

右边跑 agent（本步核心）
  POST /api/agent-run(question)
    → 调 chat.completions.create({ tools: [search_knowledge] })
    → 模型返回 tool_calls
    → 调 search_knowledge(question)
        └─ embedTexts(question, type=query) → searchChunks → Top-3
    → 把工具结果喂回 messages
    → 再调一次 chat.completions.create
    → 直到模型不再调 tool → 给出最终答案
    → MAX_ROUNDS = 3
```

## 当前能做什么

- 库内**多份文件共存**（继承自 step-2）：上传 `a.md` + `b.md`，两份都在
- **按 source 整份先删后建**：上传同名 v2 → 旧版整份删，v2 完整入库
- **检索做成工具**：
  - 「演示闲聊」（如「你好，今天天气怎么样？」）→ agent 跑 1 轮，**不调** search_knowledge，直接给寒暄回复
  - 「演示问政策」（如「7 天无理由退货怎么操作？」）→ agent 跑 1 轮，**调** search_knowledge 一次，把 `tool_result` 喂回模型，模型基于材料给最终答案
  - 调自定义问题 → 同样按 agent 循环跑
- **轨迹（trajectory）面板**：右边按 round 展开每一轮——
  - 第 1 轮：模型决定（✓ 不调工具 / 🔧 调 search_knowledge）
  - 工具调用的参数 + 命中数 + 最高分 + 命中卡片列表
  - 最终答案
- 手写 `while` 循环（**不 import 模块 07**）——本步是「最小可用」 agent，与模块 07 的"外部机制演示"粒度不同

本步不做：扫描件失败态、答准时修法提示 UI。

## 上传文件注意事项（同 step-2）

- 支持 `.md`（Markdown）和 `.pdf`（PDF）两种文件
- Markdown 按 `##` 标题分段；PDF 按 3000 字分段（凑合解，跨页段落会断）
- 文件名会成为 `source` 字段入库
- 上传**同名**文件 → 旧版整份被删，新版入库
- 上传**不同名**文件 → 与现有文件共存
- 空文件 / 损坏文件 / 扫描版 PDF → 报错不入库

行存在 SQLite（`data/chunks.db`），向量是 JSON，检索用余弦排序。`koa-body` + `formidable` 处理文件上传；`pdf-parse` v2 处理 PDF 文本提取。

需要嵌入模型（Embedding Model）。`apps/.env` 可填 `LLM_EMBEDDING_MODEL`；MiniMax / 智谱 / 千问有默认。DeepSeek 官方没有嵌入接口，请换家或改这一行。

agent 循环：`lib/agent/agent-loop.ts`；检索工具：`lib/tools/search-knowledge.ts`；最大轮数 `MAX_ROUNDS = 3`。
