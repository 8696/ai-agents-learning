# 09-RAG进阶 · 02-Rerank · step-1

## 跑入口

```bash
cd apps && yarn app:09-02-rerank-step-1
```

浏览器：`http://127.0.0.1:50092/`

## 端口

`50092`（apps/README.md 占用表、package.json yarn 脚本、`runtime-ctx.ts` `.default()`、本 README 四处一致）。

## 数据流

```text
浏览器
  ├─ 健康检查 → GET /health
  ├─ 知识库列表（可选） → GET /api/corpus
  ├─ ① 跑粗召回 → POST /api/search-recall
  │     └─ lib/flow/recall.ts
  │           ├─ searchByVector（lib/embed/create-embeddings.ts · 调嵌入模型）
  │           ├─ searchByBm25（lib/corpus/bm25.ts · 纯本地）
  │           └─ RRF 倒数排名融合（k=60，按名次投票）
  └─ ② 继续精排 → POST /api/rerank
        └─ lib/flow/rerank.ts（本步核心 · 主流程单独成文件）
              └─ 拼 prompt · 调大模型一次拿 N 个 0~1 分 · parse JSON 数组 · 按分重排
```

## 当前能做什么

- **同一问句分两次请求**：第一次 = 粗召回（向量 + BM25 + RRF）；第二次 = 精排（真调大模型按"问句 + 文档"成对打分）。
- **两榜并排**：左栏粗召回榜带 RRF 分 + 来源徽标（双通道 / 仅向量 / 仅 BM25）；右栏精排榜带精排分 + 跳动徽标。
- **名次跳动**：精排后 candidate A 的新 rank 与粗召回原 rank 相减，得到"↑/↓/→"——同一问句两张榜，至少一篇名次换位。
- **真调模型**：精排那一次必须真发网络请求，禁止写死精排分；粗召回那一次向量通道也会真发嵌入调用。

## 对应学习沉淀

- 概念：[docs/学习模块/09-RAG进阶/02-Rerank.md](../../../docs/学习模块/09-RAG进阶/02-Rerank.md)
- 本步对应取舍：本条 MD §5.4 推荐"step-1 只做 A1-A4 + 需求 1 / 5 / 7 的最小可见部分"。本 demo 覆盖：两阶段分请求 + 两张榜 + 名次跳动 + 点式精排分。

## 局限

- 精排评分用对话大模型一次性给所有候选打分；N 大（>20）会让 prompt 过长、超时或丢精度。本 demo 默认 N=5。
- 关闭精排 = 粗召回截 K、关闭对照 = 都不在本 step；变体 4/5/6/10/11/12 等放 step-2+ 再说。
- 失败归因三态（变体 14）只看见①不进候选、②在候选不在 K；③"材料在 K 生成仍错"放到有生成的 step。