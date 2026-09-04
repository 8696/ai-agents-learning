[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「模块复盘」MD / `apps/09-RAG进阶/{小节文件夹}/README.md`

# 模块 09 · RAG 进阶 ⭐⭐⭐⭐

[← 08 RAG 基础](../08-RAG基础/README.md) · [10 Memory →](../10-Memory/README.md)

> **小节进度、验收、动手落点**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/09-RAG进阶/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/09-RAG进阶/{小节文件夹}/`（详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行是**模块复盘**（只写 MD，不落代码，[AGENTS.md §7.3](../../../AGENTS.md#73-模块复盘进度表最后一行)）。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**BM25 / 混合检索**：关键词能补纯向量的短板（专有名词、编号）](./01-BM25-混合检索.md) | 知道向量不擅长什么、BM25 补什么 | `BM25 algorithm explained simple` `hybrid search vector bm25` · Elasticsearch BM25 文档 · Pinecone hybrid 教程 | — |
| ⬜ | [**Rerank**：先粗召回再精排，不是一次 Top-K 定生死](./02-Rerank.md) | 能说出两阶段各干什么 | `cross encoder reranking RAG` `Cohere rerank` · Cohere Rerank 文档 · Jina Reranker | — |
| ⬜ | [**Query Rewrite**：用户口语往往不是好检索词](./03-Query-Rewrite.md) | 知道为什么要改写 / 扩展 query | `query rewriting RAG` `HyDE retrieval` · RAG 评测博客 | — |
| ⬜ | [**切块与查询变体**：Parent-Child、Contextual Retrieval、Multi-query、Query Expansion 各补哪类失败](./04-切块与查询变体.md) | 能说清各解决什么；**至少动手做过其中两种**，其余能讲场景即可 | `parent child chunking RAG` `contextual retrieval anthropic` `multi query retrieval` `query expansion RAG` · Anthropic Contextual Retrieval · LlamaIndex 切块文档 | — |
| ⬜ | [**模块复盘**](./05-模块复盘.md) | 本页验收 + 学习沉淀 | — | [沉淀](./05-模块复盘.md) |

## 验收

> 写**模块复盘**时对照本节：复盘的「模块验收对答」表逐条抄这里。
> `coach complete` 勾复盘行前走 [AGENTS.md §7.3 闸门](../../../AGENTS.md#73-模块复盘进度表最后一行)（不查代码、不打 Demo 判断块）。

**一句话目标**：从「能用 RAG」升级到「RAG 做得好」。

**动手产出**：一个带引用、Rerank、Query Rewrite 的知识库。

**验收标准**
- [ ] 实现了 Hybrid Search（向量 + BM25 关键词）并能对比效果
- [ ] 接入了 Reranker，能展示重排前后 Top-K 的变化
- [ ] 实现了 Query Rewrite（把口语化提问改写成检索友好的查询）
- [ ] 回答中带可点击的引用来源
- [ ] 支持 Metadata Filtering（比如只在某个文档集合内检索）
- [ ] 建立了一个至少 20 条的 RAG 评测集，能算出检索命中率
- [ ] 实现并对比过 Parent-Child Chunking 或 Contextual Retrieval 之一（另一种能讲清适用场景即可）
- [ ] 能说明 Multi-query 与 Query Expansion 各解决什么；至少实现过其中一种
- [ ] 能对一次错误回答做出失败归因：切分 / 检索 / 重排 / 生成，是哪一环

**自测问题**：RAG 失败时如何排查？为什么需要 Rerank？Hybrid Search 解决了向量检索的什么短板？Parent-Child 和 Contextual Retrieval 各补什么？

**常见坑**：一次性加了五种优化手段，效果变好了但不知道是哪个起的作用。**一次只加一个变量，每次都跑评测集**。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`BM25 hybrid search` · `reranking RAG` · `query rewriting retrieval` · `parent child chunking` · `contextual retrieval`

## 动手落点

> 落到 `apps/09-RAG进阶/{小节文件夹}/`。一次加一个变量，每次跑评测集。

1. Hybrid Search（向量 + BM25），记下对比
2. Rerank → Query Rewrite，展示重排前后 Top-K
3. 引用 + metadata filter；Parent-Child 或 Contextual Retrieval 做一种
