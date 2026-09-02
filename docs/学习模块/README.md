[目录](../00-目录.md) · [上一篇](../03-学习路线.md) · [下一篇](../04-自测题库.md) · [学习总览](../06-学习总览.md)

# 学习模块

一模块一个文件夹。文件夹里：

1. **`README.md`** — **小节进度**（从上到下勾：先外部，最后一行本地）+ **验收** + **本地拆步**
2. **每小节一个 MD** — 对照学习要求的教学笔记，**由助手扩写**（你不手打）。验收看「有没有用、合上文件能否转述」，**没有金标准篇，也不按行数**（细则 [AGENTS.md §7.0 结果验收](../../AGENTS.md#70-写回扩写任意终端)）。文件名 `{两位序号}-{短名}.md`。未学是空壳；写回细则 [AGENTS.md §7.0](../../AGENTS.md#70-写回扩写任意终端)、[§7.2](../../AGENTS.md#72-沉淀--小节进度对齐)。可多次追加。你只减不加。

「我的链接」列只填 URL 或 `暂无链接`；**来源**写进该条小节 MD，不写「留在本对话学」进链接列（[AGENTS.md §7.1](../../AGENTS.md#71-我的链接列)）。

代码落点统一在 `apps/`：模块 00 mini-app 在 `apps/00-环境准备/01-mini-app/`（兼模块 00 本地产出）；其余外部小节按 [§5.2](../../AGENTS.md#52-小节-demo) 落最小可运行 Demo 到 `apps/{模块}/{小节}/`；每个模块最后一行本地产出按 [§5.4](../../AGENTS.md#54-模块小-app本地产出行) 落模块小 APP 到 `apps/{模块}/{NN}-本地产出/`。每个子文件夹只迭代 `README.md`（怎么跑 + 当前能做什么）一份，跟代码改写。**不要**改已经写好的小节 MD。各模块 README **本地拆步**对照小 APP 要串什么，不是「最后一节才动手写按条 Demo」。整条路线过没过完看 [学习总览](../06-学习总览.md)。

**任意终端学概念 / 写回：** 标准在 [AGENTS.md §1](../../AGENTS.md#1-角色) / [§6.2](../../AGENTS.md#62-概念讲解任意终端--外部节奏) / [§7.0](../../AGENTS.md#70-写回扩写任意终端)。出门包仅点名（[§6.1](../../AGENTS.md#61-外部学习出门包点名才出)），与详解同一套学习要求。进度表「本条要能讲清」列管能不能勾 ✅。

| # | 模块 |
| - | ---- |
| 00 | [环境准备](./00-环境准备/README.md) |
| 01 | [AI & LLM 基础认知](./01-AI与LLM基础认知/README.md) |
| 02 | [LLM API 开发](./02-LLM-API开发/README.md) |
| 03 | [Prompt Engineering](./03-Prompt-Engineering/README.md) |
| 04 | [Structured Output](./04-Structured-Output/README.md) |
| 05 | [Tool Calling](./05-Tool-Calling/README.md) |
| 06 | [多轮对话 & Context](./06-多轮对话与Context/README.md) |
| 07 | [手写 Agent](./07-手写Agent/README.md) |
| 08 | [RAG 基础](./08-RAG基础/README.md) |
| 09 | [RAG 进阶](./09-RAG进阶/README.md) |
| 10 | [Memory](./10-Memory/README.md) |
| 11 | [Agent State / Workflow](./11-Agent-State-Workflow/README.md) |
| 12 | [MCP](./12-MCP/README.md) |
| 13 | [Agent Framework](./13-Agent-Framework/README.md) |
| 14 | [Multi-Agent](./14-Multi-Agent/README.md) |
| 15 | [Browser / Computer Agent](./15-Browser-Computer-Agent/README.md) |
| 16 | [Coding Agent](./16-Coding-Agent/README.md) |
| 17 | [Agent Evaluation](./17-Agent-Evaluation/README.md) |
| 18 | [Observability](./18-Observability/README.md) |
| 19 | [可靠性 / 成本 / 性能](./19-可靠性成本性能/README.md) |
| 20 | [AI Security](./20-AI-Security/README.md) |
| 21 | [后端 & 基础设施](./21-后端与基础设施/README.md) |
| 22 | [AI 全栈产品化](./22-AI全栈产品化/README.md) |
| 23 | [Production Agent Architecture](./23-Production-Agent-Architecture/README.md) |

---

每个模块文件夹必须有：

1. **README.md**：小节进度、验收、本地拆步（缺了就补，不要另起一套结构）
2. **与进度表一一对应的小节 MD**（含最后一条本地产出；文件名带两位序号）

**时间量级**：外部一条大约 15–40 分钟；本地产出按验收走，有代码的模块往往要一个晚上或更久。

**编号**：文档 `docs/01-使用协议.md` ≠ **模块 01**（AI & LLM 基础认知）。说编号时写全名或写路径。小节 MD 用 `01` `02` `03`… 前缀，与进度表顺序一致。
