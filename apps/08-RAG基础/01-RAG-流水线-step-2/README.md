# RAG 流水线 · step-2（按 source 整份先删后建 · 多份文件共存）

对应笔记：[docs/学习模块/08-RAG基础/01-RAG-流水线.md](../../docs/学习模块/08-RAG基础/01-RAG-流水线.md)

## 现在怎么跑

```bash
cd apps
yarn app:08-01-rag-pipeline-step-2
```

浏览器打开 http://127.0.0.1:50068/

端口：`50068`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表同一数字）

## 数据流

```text
点「建库（refund.md）」POST /api/ingest
  knowledge/refund.md ──Load──► 原文 + source
                   ──Chunk─► 若干卡片（按 ## 标题分段）
                   ──Embed──► 每张一条向量
                   ──按 source 整份先删后建──► deleteBySource("refund.md") → addChunks
                   （库里有其它文件不会被删）

点「上传 Markdown 或 PDF 文件入库」POST /api/ingest-upload
  multipart/form-data → ──Load──► 原文 + 文件名当 source
                      ──Chunk─► Markdown 按 ## / PDF 按 3000 字
                      ──Embed──► 每张一条向量
                      ──按 source 整份先删后建──► deleteBySource(filename) → addChunks
                      （同名上传 → 旧版整份删；不同名 → 与现有文件共存）
  支持 .md / .pdf；扫描版 PDF（正文为空）→ 报错不入库

点「查看库」GET /api/store
  SELECT chunks ─► 把所有行打到页面上

点「查看库来源」GET /api/store-sources
  SELECT source, COUNT(*) GROUP BY source ─► 库里所有不同文件 + 行数

点「提问」POST /api/ask
  问题 ──Embed──► 问题向量（同一嵌入模型）
       ──Retrieve──► 前 3 条 + 余弦分数 + 来源
       ──Generate──► 带材料的提示词 → 回答
```

## 当前能做什么

- 库内**多份文件共存**：上传 `a.md` 后再上传 `b.md`，库里两份都在
- **按 source 整份先删后建**：上传同名 v2 文件 → 旧版整份删，v2 完整入库；旧版不再被命中
- 「建库（refund.md）」按钮也走按 source 先删后建：再点一次只替换 refund.md 的行，库内其它文件不动
- 库里当前的来源清单：左侧面板顶部"库里当前有 N 份来源"会列出每个文件名 + 行数
- 提问检索命中的来源会显示具体文件名（如 `a.md`、`refund.md`），不是"整库"
- 库里没有相关材料时，弃权（Abstain）路径仍然可用

本步不做：扫描件失败态、检索做成工具、答准时修法提示 UI。

## 上传文件注意事项

- 支持 `.md`（Markdown）和 `.pdf`（PDF）两种文件
- Markdown 按 `##` 标题分段；PDF 按 3000 字分段（凑合解，跨页段落会断）
- 文件名会成为 `source` 字段入库，检索命中的「来源」会显示这个文件名
- 上传**同名**文件 → 旧版整份被删，新版入库（按文件粒度更新）
- 上传**不同名**文件 → 与现有文件共存
- 空文件 / 损坏文件 / 扫描版 PDF → 报错不入库

行存在 SQLite（`data/chunks.db`），向量是 JSON，检索用余弦排序。`koa-body` + `formidable` 处理文件上传（`multipart/form-data`）；`pdf-parse` v2 处理 PDF 文本提取。

需要嵌入模型（Embedding Model）。`apps/.env` 可填 `LLM_EMBEDDING_MODEL`；MiniMax / 智谱 / 千问有默认。DeepSeek 官方没有嵌入接口，请换家或改这一行。

弃权阈值（`ABSTAIN_MAX_SCORE = 0.5`）写在 `lib/flow/ask-pipeline.ts`。
