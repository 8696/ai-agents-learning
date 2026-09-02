[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md)

# 模块 01 · AI & LLM 基础认知 ⭐⭐⭐⭐⭐

[← 00 环境准备](../00-环境准备/README.md) · [02 LLM API 开发 →](../02-LLM-API开发/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以该小节 `apps/` README 为准。
> **代码落点**：按条 Demo：[`02-Token`](../../../apps/01-AI与LLM基础认知/02-Token/) · [`06-Embedding`](../../../apps/01-AI与LLM基础认知/06-Embedding/) · [`07-Temperature-Top-P`](../../../apps/01-AI与LLM基础认知/07-Temperature-Top-P/)。本地产出 Demo APP：[`11-本地产出`](../../../apps/01-AI与LLM基础认知/11-本地产出/)。Transformer / Attention / Context 是伪代码，不建文件夹。

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是本模块小 APP（把已学能力串起来，不 import 其它小节），不是再讲一节新概念、也不是从零灌代码（[AGENTS.md §5.4](../../../AGENTS.md#54-模块小-app本地产出行)）。

> 先按表从上到下看完（约 3～4 小时），再把已落代码收成 Demo APP。不要推公式。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ✅ | [**AI / ML / DL 与能力边界**：三者是包含关系；神经网络是用数据拟合输入→输出；LLM 有明确做不好的事](./01-AI-ML-DL-与能力边界.md) | 能画包含关系；不推公式；能举 3 件当前模型做不好的事 | `AI vs ML vs DL` `neural network intuition` `LLM limitations` · 任意 15 min 科普（不要开课） | 暂无链接 |
| ✅ | [**Token**：模型读写的计费单位，不是「字」也不是「词」；中文通常更贵](./02-Token.md) | 能解释计费单位、中英文差异 | `what is LLM token` `GPT tokenizer 中文` `tiktoken demo` · OpenAI tokenizer 工具 · [tiktoken](https://github.com/openai/tiktoken) · B 站搜「大模型 Token 是什么」 | 暂无链接 |
| ✅ | [**Context Window**：一次请求里输入 + 输出共享的长度上限](./03-Context-Window.md) | 能解释超了怎么办（截断 / 摘要） | `LLM context window explained` `context length limit` · 各模型文档的 context 说明 · YouTube「context window LLM」 | 暂无链接 |
| ✅ | [**Transformer**：Encoder / Decoder；Self-Attention 用来「看整句关系」](./04-Transformer.md) | **不要推公式**；能画这三块 | `Transformer architecture explained` `Attention Is All You Need 图解` · Jay Alammar [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) · 3Blue1Brown 注意力相关 | 暂无链接 |
| ✅ | [**Attention / Self-Attention**：每个词根据整句其它词算权重](./05-Attention-Self-Attention.md) | 能用一句话说清 | `self attention intuitive explanation` `Q K V attention` · 同上 Jay Alammar · 李宏毅 Transformer 章节（选看） | 暂无链接 |
| ✅ | [**Embedding**：文本 → 向量；语义近的距离近；和 Token 不是同一层](./06-Embedding.md) | 能区分 Token（离散计数）和 Embedding（连续向量） | `word embedding visualization` `text embedding semantic similarity` · TensorFlow Embedding Projector · OpenAI Embeddings 文档 | 暂无链接 |
| ✅ | [**Temperature / Top-P**：随机性怎么控；抽取任务 vs 创意任务](./07-Temperature-Top-P.md) | 能说清两者区别、什么场景调哪个 | `LLM temperature top_p sampling` `nucleus sampling` · OpenAI / Anthropic 官方参数说明 | 暂无链接 |
| ✅ | [**Hallucination**：模型在预测下一个 Token，不是在查数据库](./08-Hallucination.md) | 能用一句话说明成因 | `LLM hallucination why` `大模型幻觉 原因` · Anthropic / OpenAI 安全文档 · 任意 10 分钟科普视频 | 暂无链接 |
| ✅ | [**预训练 vs 推理**：训练你不做；你调 API 做的是推理](./09-预训练-vs-推理.md) | 能分清两阶段各自发生什么 | `LLM pretraining vs inference` `RLHF explained simple` · Karpathy「Intro to LLMs」类视频 · 论文只看摘要 | 暂无链接 |
| ✅ | [**主流模型对比**：至少 4 家的强项、价格档、Context 上限](./10-主流模型对比.md) | 能列表，不要求背参数 | `GPT-4 vs Claude vs Gemini comparison 2025` `模型选型 agent` · 各厂商 Model Card · [Artificial Analysis](https://artificialanalysis.ai/) | 暂无链接 |
| ✅ | [**本地产出**](./11-本地产出.md) | 打开上新台：贴原料能出一张卡，卡上能看见 Token、窗口截断、相近现货、低温货名和高温卖点 | — | [沉淀](./11-本地产出.md) |

推荐最小观看（做完把**你打开过的 URL**填进上表）：AI/ML/DL 包含关系科普（15 min 内）→ Jay Alammar *Illustrated Transformer* → Token / Context 科普 → 在线 tokenizer 数一段中英文 → 各厂 Model Card / 价格页。

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：理解大模型到底是什么，以及它为什么能工作。

**动手产出**：豆谷上新台（一个应用）：`apps/01-AI与LLM基础认知/11-本地产出/`（`yarn app:01-11-cognition-lab`，端口 `50111`）。打开后贴原料 → 一张上新卡。按条 Token / Embedding / 温度 Demo 仍保留，不 import。综合笔记在 [11-本地产出.md](./11-本地产出.md)。

**验收标准**
- [x] 浏览器打开上新台（`50111`），是一张产品卡而不是三个 Demo 按钮
- [x] 能画出 AI ⊃ ML ⊃ DL 的包含关系，并用一句话说清神经网络是「用数据拟合输入到输出」（不推公式）
- [x] 能举出至少 3 件当前 LLM **做不好**的事（能力边界），和幻觉、Context 上限区分开
- [x] 能解释 Token、Context Window、Embedding、Transformer、Attention 各自解决什么问题
- [x] 能说清 Temperature 和 Top-P 的区别，以及什么场景该调哪个
- [x] 能用一句话说明幻觉（Hallucination）的成因
- [x] 能列出至少 4 个主流模型及其擅长场景与价格档位
- [x] 用 tokenizer 在 Demo APP 里实际数过一段中文和英文的 Token 数，知道中文更贵

**自测问题**：AI / ML / DL 是什么关系？Transformer 的 Self-Attention 在做什么？为什么 Context Window 有上限？Embedding 和 Token 有什么关系？当前 LLM 做不好哪几件事？

**常见坑**：陷进 Transformer 数学推导（B 档内容），迟迟不写一行代码。设硬性上限。Token / Temperature 该看见数字的已经落了 Demo；不要为 Attention 再起一个进程。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：⭐ 本模块大部分是概念；**Token 用本地 tokenizer 数过、Temperature 跑过对照**就算代码侧够了
- `LLM token explained` · `tiktoken 中文` — 跑 `yarn app:01-02-token`，或再用在线 tokenizer 对一下
- `context window limit LLM` — 各模型文档的 Context 章节
- `illustrated transformer` — Jay Alammar《The Illustrated Transformer》，**不要推公式**
- `why LLM hallucinate` — 任意 10 min 科普视频
- 完整表 + 推荐观看清单 → [有序清单](#小节进度)

## 本地拆步

> 本地产出 = 豆谷上新台。不要把后面模块的 API / RAG 灌进本模块。

1. `yarn app:01-11-cognition-lab` → `http://127.0.0.1:50111/`
2. 按条 CLI / `50107` 仍保留，本 APP **不 import** 那些文件夹
3. 幻觉串讲仍在 [11-本地产出.md](./11-本地产出.md)
