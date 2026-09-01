[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/08-RAG基础/{小节文件夹}/README.md`

# 模块 08 · RAG 基础 ⭐⭐⭐⭐⭐

[← 07 手写 Agent](../07-手写Agent/README.md) · [09 RAG 进阶 →](../09-RAG进阶/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/08-RAG基础/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/08-RAG基础/{小节文件夹}/`（学到再建；详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**RAG 流水线**：Load → Chunk → Embed → Retrieve → Generate](./01-RAG-流水线.md) | 能默画这一条，不要求背论文 | `RAG retrieval augmented generation explained` `RAG pipeline diagram` · [RAG 论文摘要](https://arxiv.org/abs/2005.11401) · LlamaIndex / LangChain RAG 概念页 | — |
| ⬜ | [**Chunking**：太大丢细节、太小丢语义；overlap 补边界](./02-Chunking.md) | 能说出 size / overlap 的取舍 | `text chunking strategies RAG` `chunk size overlap RAG` · Pinecone / LanceDB 博客 | — |
| ⬜ | [**余弦相似度**：比的是方向，不是向量长度](./03-余弦相似度.md) | 能解释「语义近」在几何上是什么 | `cosine similarity embedding` `vector similarity search` · 3Blue1Brown 向量 · 任意 10 min 科普 | — |
| ⬜ | [**RAG vs Fine-tuning**：知识常变 / 要引用 → RAG；风格 / 格式稳 → 才考虑微调](./04-RAG-vs-Fine-tuning.md) | 能用一句话说选型 | `RAG vs fine tuning when to use` · OpenAI / Anthropic 官方对比文 | — |
| ⬜ | [**本地产出**](./05-本地产出.md) | 本页验收 + 学习沉淀（落 `apps/08-RAG基础/{小节文件夹}/`） | — | [沉淀](./05-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：让 Agent 能使用它训练时没见过的外部知识。

**动手产出**：Markdown/PDF → Chunk → Embedding → Vector DB → Retrieval → LLM 全流水线。检索封装成 Tool，由本 demo 自己的最小循环决定要不要检索——不要 import `apps/07-手写Agent/`。

**验收标准**
- [ ] 至少支持 Markdown 和 PDF 两种格式的文档加载
- [ ] 实现并对比了至少两种 Chunking 策略（固定长度 vs 按结构切分）
- [ ] Chunk 携带 metadata（来源文件、页码/章节、位置）
- [ ] 向量检索能返回 Top-K 和相似度分数
- [ ] 检索结果注入 Prompt 的格式是清晰、带来源标注的
- [ ] **检索被封装成一个 Tool**，Agent 可以自主决定要不要检索
- [ ] 有一个「知识库里没有答案」的测试，模型应该说不知道而不是编造

**自测问题**：Chunk 大小如何选择？Overlap 有什么用？为什么余弦相似度适合做语义检索？RAG 和 Fine-tuning 怎么选？

**常见坑**：把检索写死在流程里（每次都检索），而不是做成 Tool 让 Agent 判断。前者在闲聊时会检索出一堆噪音。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`RAG pipeline explained` · `chunking strategies RAG` · `cosine similarity embedding`

## 本地拆步

> 落到 `apps/08-RAG基础/{小节文件夹}/`。`apps/` 下每个子文件夹互不 import；本 demo 自己写最小循环。

1. Load → Chunk → Embed → LanceDB → Retrieve
2. 检索做成**本 demo 内**的 Tool，自带最小循环决定要不要检索
3. 「库里没有」必须说不知道，不要编
