# RAG 流水线 · step-2（Markdown / PDF 文件上传入库）

对应笔记：[docs/学习模块/08-RAG基础/01-RAG-流水线.md](../../docs/学习模块/08-RAG基础/01-RAG-流水线.md)

## 现在怎么跑

```bash
cd apps
yarn app:08-01-rag-pipeline-step-1
```

浏览器打开 http://127.0.0.1:50067/

端口：`50067`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表同一数字）

## 数据流

```text
点「建库（refund.md）」POST /api/ingest
  knowledge/refund.md ──Load──► 原文 + source
                   ──Chunk─► 若干卡片（按 ## 标题分段）
                   ──Embed─► 每张一条向量
                   ──写入──► SQLite 多行四件套

点「上传 Markdown 或 PDF 文件入库」POST /api/ingest-upload
  multipart/form-data → ──Load──► 原文 + 文件名当 source
                      ──Chunk─► Markdown 按 ## 标题分段；PDF 按页分段（pdf-parse v2）
                      ──Embed─► 每张一条向量
                      ──写入──► SQLite 多行四件套
  支持 .md / .pdf；扫描版 PDF（正文为空）→ 报错不入库

点「查看库」GET /api/store
  SELECT chunks ─► 把已写入的 id / vector / text / source / section / chunkIndex 打到页面
                  （不调嵌入、不调聊天）

点「提问」POST /api/ask
  问题 ──Embed──► 问题向量（同一嵌入模型）
       ──Retrieve──► 前 3 条 + 余弦分数 + 来源
       ──Generate──► 带材料的提示词 → 回答
```

## 当前能做什么

- refund.md 点「建库（refund.md）」入库；自己准备 Markdown 或 PDF 点「上传 Markdown 或 PDF 文件入库」入库——两种方式二选一
- Markdown 按 `##` 标题分段；PDF 按页分段（pdf-parse v2）；文件名会成为 `source` 入库
- 上传后可以立即在「查看库」里看到新文件的每一行；PDF 的切块 section 显示「第 N 页」
- 点「查看库」看见 SQLite 里每一行的四件套（含完整向量）。向量开头应是带正负号的小数；若全是 0，说明嵌入解码错了，改完后必须重新建库
- 提问看见检索卡片和带来源的回答（来源是你上传的文件名）
- 连续提问不会再跑加载 / 切块
- 库里没有相关材料时，点「演示库里没有答案」→ 检索质量摘要卡片显示命中数 / Top-1 最高分 / 阈值 / 是否触发弃权（Abstain）；提示词里材料区被替换成「（无可用材料）」，模型被强制要求说「不知道」，不编政策 / 订单号 / 菜单

本步不做：扫描件失败态（PDF 抽文本为空会报错，暂不做「解析成功但乱码」的进一步判断）、检索做成工具、按来源删旧（当前是整表清空再写）、答不准修法提示 UI。

## 上传文件注意事项

- 支持 `.md`（Markdown）和 `.pdf`（PDF）两种文件
- Markdown 按 `##` 标题分段，每段一个切块；没有 `##` 标题的 Markdown 会报错
- PDF 按页分段（用 pdf-parse v2 抽文本）；**扫描版 PDF（全是图片，正文为空）会报错不入库**，这是加载失败态之一
- 文件名会成为 `source` 字段入库，检索命中的「来源」会显示这个文件名
- 空文件 / 损坏文件 → 报错不入库
- 上传后会清空旧库（走整表 `DELETE` 再写入）；如果想保留 refund.md，重新点「建库（refund.md）」即可

行存在 SQLite（`data/chunks.db`），向量是 JSON，检索用余弦排序。`koa-body` + `formidable` 处理文件上传（`multipart/form-data`）；`pdf-parse` v2 处理 PDF 文本提取。

需要嵌入模型（Embedding Model）。`apps/.env` 可填 `LLM_EMBEDDING_MODEL`；MiniMax / 智谱 / 千问有默认。DeepSeek 官方没有嵌入接口，请换家或改这一行。

弃权阈值（`ABSTAIN_MAX_SCORE = 0.5`）写在 `lib/flow/ask-pipeline.ts`。
