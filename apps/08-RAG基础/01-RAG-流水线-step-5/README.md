# RAG 流水线 · step-5（PDF 按页段 + 命中卡片显示页码）

对应笔记：[docs/学习模块/08-RAG基础/01-RAG-流水线.md](../../docs/学习模块/08-RAG基础/01-RAG-流水线.md)

## 现在怎么跑

```bash
cd apps
yarn app:08-01-rag-pipeline-step-5
```

浏览器打开 http://127.0.0.1:50071/

端口：`50071`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表同一数字）

## 数据流

```text
点「建库（refund.md）」POST /api/ingest
  knowledge/refund.md ──Load──► 原文 + source
                   ──Chunk─► 若干卡片（按 ## 标题分段；无 page 字段）
                   ──Embed──► 每张一条向量
                   ──按 source 整份先删后建──► deleteBySource("refund.md") → addChunks

点「上传 Markdown 或 PDF 文件入库」POST /api/ingest-upload
  multipart/form-data → ──Load──► 原文 + 文件名当 source
                      ──Chunk─► Markdown 按 ## / <b>PDF 按页分段（每页 = 1 chunk；page 字段写入）</b>
                      ──Embed──► 每张一条向量
                      ──按 source 整份先删后建──► deleteBySource(filename) → addChunks（page 字段一并入库）

点「查看库」GET /api/store
  SELECT chunks ─► 把所有行打到页面上（PDF 行带「第 N 页」徽标）

点「查看库来源」GET /api/store-sources
  SELECT source, COUNT(*) GROUP BY source ─► 库里所有不同文件 + 行数

点「提问」POST /api/ask
  问题 ──Embed──► 问题向量（同一嵌入模型）
       ──Retrieve──► 前 3 条 + 余弦分数 + 来源（PDF 命中带「第 N 页」）
       ──Generate──► 带材料 + 页码的提示词 → 回答
```

## 当前能做什么

- step-1 / 2 / 3 / 4 全部继承：建库 / 上传 / 按 source 整份先删后建 / 多份共存 / 检索做成工具 / 答准时修法提示
- **本步新增**：
  - PDF 切块粒度从「按 3000 字」改成「按页」——每页 = 1 个 chunk，`ChunkRow.page` 字段写入
  - 单页超 6000 字时截断并标 `…（已截断）`
  - SQLite 表结构加 `page INTEGER`（老库自动 ALTER）
  - 「查看库」每行新增「第 N 页」徽标（PDF 行才有）
  - 提问命中卡片显示「第 N 页」徽标（PDF 命中才有）
  - 提示词材料区也带「第 N 页」（PDF 命中）

## PDF 切块粒度选择（笔记取舍）

| 粒度 | 优点 | 代价 |
| -- | -- | -- |
| **按页**（本步） | 命中卡片能显示页码；语义边界 = 页面边界 | 单页超长被截断到 6000 字 |
| 按字数（step-1~4） | chunk 大小均匀 | 跨页段落从中间断；命中卡片看不到页码 |
| 两者结合（生产推荐） | 既保留页码又兜底长度 | 实现复杂；第 2 条 Chunking 会深入讲 |

## 上传文件注意事项

- 支持 `.md`（Markdown）和 `.pdf`（PDF）两种文件
- Markdown 按 `##` 标题分段；每段无 page 字段
- PDF 按页分段；每页 = 1 个 chunk；命中卡片显示「第 N 页」
- 空文件 / 损坏文件 / 扫描版 PDF（正文为空） → 报错不入库
- 上传**同名**文件 → 旧版整份被删，新版入库
- 上传**不同名**文件 → 与现有文件共存

行存在 SQLite（`data/chunks.db`），向量是 JSON，检索用余弦排序。`koa-body` + `formidable` 处理文件上传；`pdf-parse` v2 处理 PDF 文本提取；`pdf-parse` 按 `\f`（换页符）拆出每页。

需要嵌入模型（Embedding Model）。`apps/.env` 可填 `LLM_EMBEDDING_MODEL`；MiniMax / 智谱 / 千问有默认。DeepSeek 官方没有嵌入接口，请换家或改这一行。

弃权阈值（`ABSTAIN_MAX_SCORE = 0.5`）写在 `lib/flow/ask-pipeline.ts`。
