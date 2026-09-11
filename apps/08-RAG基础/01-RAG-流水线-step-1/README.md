# RAG 流水线 · step-1

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
点「建库」POST /api/ingest
  refund.md ──Load──► 原文 + source
           ──Chunk─► 若干卡片（章节标题当 section）
           ──Embed─► 每张一条向量
           ──写入──► SQLite 多行四件套（LanceDB 包已装，本步没 import）

点「查看库」GET /api/store
  SELECT chunks ──► 把已写入的 id / vector / text / source / section / chunkIndex 打到页面
                  （不调嵌入、不调聊天）

点「提问」POST /api/ask
  问题 ──Embed──► 问题向量（同一嵌入模型）
       ──Retrieve──► 前 3 条 + 余弦分数 + 来源
       ──Generate──► 带材料的提示词 → 回答
```

## 当前能做什么

- 看见一本说明书变成多行（原文、切块、写入条数）
- 页面左右分栏：左边建库 / 查看库，右边提问
- 点「查看库」看见 SQLite 里每一行的四件套（含完整向量）。向量开头应是带正负号的小数；若全是 0，说明嵌入解码错了，改完后必须重新建库
- 提问看见检索卡片和带来源的回答
- 连续提问不会再跑加载 / 切块
- 空问题 4xx、故意 5xx 两套错误
- 库里没有相关材料时，点「演示库里没有答案」→ 检索质量摘要卡片显示命中数 / Top-1 最高分 / 阈值 / 是否触发弃权（Abstain）；提示词里材料区被替换成「（无可用材料）」，模型被强制要求说「不知道」，不编政策 / 订单号 / 菜单

本步不做：PDF、扫描件失败、检索做成工具、按来源删旧、行级多份重建、答不准修法提示 UI。

行存在 SQLite（`data/chunks.db`），向量是 JSON，检索用余弦排序。模块选型仍是 LanceDB；`@lancedb/lancedb` 已进 `apps/package.json`，本步读写仍是 `better-sqlite3`。装上 ≠ 已经在检索。以后换存储，四件套字段不用改。

需要嵌入模型（Embedding Model）。`apps/.env` 可填 `LLM_EMBEDDING_MODEL`；MiniMax / 智谱 / 千问有默认。DeepSeek 官方没有嵌入接口，请换家或改这一行。智谱走 OpenAI 兼容 SDK 时必须带 `encoding_format: "float"`，否则查看库会看到全 0。手册按 `##` 切，加厚后卡片会变多；旧库不会自动更新，改完手册要再点「建库」。

弃权阈值（`ABSTAIN_MAX_SCORE = 0.5`）写在 `lib/flow/ask-pipeline.ts`。按笔记取舍表「分数线等 Demo 跑出来再定，禁止拍脑袋写死」，这个 0.5 是先用做演示；调整方法是同一条无关问题打几次，看 Top-1 通常落在哪一带，把这条线挪到能区分「真命中 / 假命中」的位置。
