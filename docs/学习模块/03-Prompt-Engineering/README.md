[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/03-Prompt-Engineering/{小节文件夹}/README.md`

# 模块 03 · Prompt Engineering ⭐⭐⭐⭐

[← 02 LLM API 开发](../02-LLM-API开发/README.md) · [04 Structured Output →](../04-Structured-Output/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/03-Prompt-Engineering/{小节文件夹}/README.md` 为准。
> **代码落点**：按条 Demo 在 `01`/`02`/`04`；本地产出 Demo APP：[05-本地产出](../../../apps/03-Prompt-Engineering/05-本地产出/)（`50305`）。

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是本模块小 APP（把已学能力串起来，不 import 其它小节），不是再讲一节新概念、也不是从零灌代码（[AGENTS.md §5.4](../../../AGENTS.md#54-模块小-app本地产出行)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ✅ | [**System / User / Assistant 优先级**：冲突时谁说了算、System 该放什么](./01-System-User-Assistant-优先级.md) | 能解释优先级和 System 的职责 | `system prompt vs user prompt priority` `Claude system prompt` · [Anthropic Prompt Engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) · OpenAI Prompting Guide | — |
| ✅ | [**Few-shot / Zero-shot**：示例怎么帮模型「对齐格式」](./02-Few-shot-Zero-shot.md) | 能对比你的任务上哪种更稳 | `few shot prompting examples` `in-context learning` · 同上官方教程 | — |
| ✅ | [**CoT / ReAct（概念）**：先知道思想；循环到模块 07 再写](./03-CoT-ReAct概念.md) | 能说清思想，现在不要实现 Agent Loop | `chain of thought prompting` `ReAct paper summary` · Anthropic CoT 章节 · [ReAct 论文摘要](https://arxiv.org/abs/2210.03629) | 暂无链接 |
| ✅ | [**Prompt 版本管理**：Prompt 也是代码，要 diff、要回归](./04-Prompt-版本管理.md) | 知道改 Prompt 和改代码一样要可追溯 | `prompt versioning best practices` · LangSmith Prompt Hub 概念 · 工程博客 | 暂无链接 |
| ✅ | [**本地产出**](./05-本地产出.md) | 打开豆谷客服中台能处理一封来信，得到一张完整工单 | — | [沉淀](./05-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：让模型稳定按照你的要求工作，而不是「有时候好有时候不好」。

**动手产出**：一份**客服产品**（不是按条 Demo 拼盘）：`yarn app:03-05-prompt-lab` → `http://127.0.0.1:50305/`。贴一封来信得到工单（路由 / 抽字段 / Few-shot 评价 / 情感 / 转述 / 摘要）；也可做会议待办和制度问答。Prompt 源文件 `src/prompts.ts`。Zero/Few 对照页仍是按条 Demo `50302`。CLI 回归可选。

**验收标准**
- [ ] 打开后是「豆谷客服中台」，不是一排 Demo 按钮
- [ ] 处理一封来信能看到完整工单；页脚有所用 Prompt 的版本号
- [ ] `src/prompts.ts` 里每个任务仍有版本记录和 5 条回归样本（CLI 可跑）
- [ ] System 放产品规则、User 放客户原文；评价走 Few-shot
- [ ] 用户输入经过模板转义
- [ ] 空来信 400；请求失败 / 断网有错误态

**自测问题**：如何用 Prompt 减少幻觉？Few-shot 的示例应该怎么挑？System Prompt 和 User Prompt 里的指令冲突时模型听谁的？

**常见坑**：把 Prompt 当成玄学不断加「你必须！！！一定要！！！」，而不是改结构、加示例、加约束。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`few shot prompting` · `chain of thought` · Anthropic Prompt 官方

## 本地拆步

> 落到 `apps/03-Prompt-Engineering/05-本地产出/`（模块小 APP，独立实现）。

1. `yarn app:03-05-prompt-lab` → 豆谷客服中台 `http://127.0.0.1:50305/`
2. 来信出工单；会议待办；制度问答。禁止做成 Demo 按钮盘
3. 源文件 `src/prompts.ts`；**禁止** import `01-`～`04-`
4. 对照 Few-shot 仍看 `yarn app:03-02-few-shot-zero-shot`；CLI 回归可选
