[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/17-Agent-Evaluation/{小节文件夹}/README.md`

# 模块 17 · Agent Evaluation ⭐⭐⭐⭐⭐

[← 16 Coding Agent](../16-Coding-Agent/README.md) · [18 Observability →](../18-Observability/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/17-Agent-Evaluation/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/17-Agent-Evaluation/{小节文件夹}/`（详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是本模块小 APP（把已学能力串起来，不 import 其它小节），不是再讲一节新概念、也不是从零灌代码（[AGENTS.md §5.4](../../../AGENTS.md#54-模块小-app本地产出行)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**LLM-as-Judge**：用模型打分方便，但 Judge 自己也有偏差](./01-LLM-as-Judge.md) | 知道不能把 Judge 分数当成客观真理 | `LLM as a judge evaluation` `G-eval metric` · OpenAI Evals · LangSmith Evaluation | — |
| ⬜ | [**轨迹评测**：工具调对了没有、步骤是否跑偏，不只看最终答案](./02-轨迹评测.md) | 能说出至少 2 个过程指标 | `agent trajectory evaluation` `tool call accuracy metric` · Langfuse / LangSmith 文档 | — |
| ⬜ | [**Faithfulness / Relevance / Retrieval Accuracy**：检索对了吗、回答是否只基于检索材料、答是否切题](./03-Faithfulness-Relevance-Retrieval-Accuracy.md) | 能区分这三项；评测报告里至少能量其中一项 | `RAG faithfulness metric` `answer relevance vs retrieval accuracy` · RAGAS / 评测博客 | — |
| ⬜ | [**CI / ship-no-ship**：改动前后用同一 Golden Set 出数字，再决定能不能上](./04-CI-ship-no-ship.md) | 能描述一条「命令出报告」的门禁 | `LLM eval CI github actions` `golden dataset regression` · LangSmith / Promptfoo CI 示例 | — |
| ⬜ | [**本地产出**](./05-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./05-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：解决「Agent 到底好不好」这个问题——从此告别凭感觉调 Prompt。

**动手产出**：Golden Dataset + 自动评测脚本。

**验收标准**
- [ ] 有一个至少 30 条的 Golden Dataset（输入 + 期望输出/期望行为）
- [ ] 实现了 LLM-as-Judge 评分
- [ ] 有 Tool 调用正确率指标（该调的调了没、参数对不对）
- [ ] 有 Trajectory Evaluation（不只看最终答案，看执行路径是否合理）
- [ ] 评测能一条命令跑完并输出报告（例如 `yarn app:17-01-eval`，学到该条再写入 `apps/package.json`）
- [ ] **进 CI 或等价闸门**：改代码后必须先跑评测；没有数字不能声称「变好了」
- [ ] 至少有一次真实记录：某次改动让某指标从 X 到 Y，并据此做 **ship / no-ship**（成功率、Tool 正确率、Token 成本至少两项）
- [ ] 报告里能量 **Faithfulness**（回答是否只基于检索到的材料）或等价项；能口头区分 Relevance（答得切不切题）与 Retrieval Accuracy（检索命中了没有）
- [ ] 能口头区分 offline 回归 vs online / shadow eval（后者概念即可，不必上线）

**自测问题**：如何评估一个 Agent 好不好？什么叫 ship/no-ship？LLM-as-Judge 的偏差怎么处理？为什么要评估轨迹而不只是结果？Faithfulness 量的是什么？

**常见坑**：觉得「我这是学习项目，不用做评测」。恰恰相反——**没有评测，你后面所有的调优都是在凭感觉猜**，改动是好是坏你根本不知道。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`LLM as a judge` · `agent trajectory evaluation` · `RAG faithfulness`

## 本地拆步

> 落到 `apps/17-Agent-Evaluation/{小节文件夹}/`。

1. Golden Dataset ≥30 条；`yarn app:17-01-eval` 一条命令出报告（学到该条再加脚本）
2. 最终答案 + 轨迹（Tool 是否该调）都评；能量 Faithfulness 或等价项
3. 一次真实改动记下指标变化，据此 ship / no-ship，写进沉淀
