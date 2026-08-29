[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / 项目 LEARNING.md

# 模块 03 · Prompt Engineering ⭐⭐⭐⭐

[← 02 LLM API 开发](../02-LLM-API开发/README.md) · [04 Structured Output →](../04-Structured-Output/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」仍以项目 `LEARNING.md` 为准（行号会变）。
> **项目当前地图**：[LEARNING.md](../../../apps/01-chatgpt-mini/LEARNING.md)（回填）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。

| 状态 | 重点（学什么） | 够用就算过 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**System / User / Assistant 优先级**：冲突时谁说了算、System 该放什么](./01-System-User-Assistant-优先级.md) | 能解释优先级和 System 的职责 | `system prompt vs user prompt priority` `Claude system prompt` · [Anthropic Prompt Engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) · OpenAI Prompting Guide | — |
| ⬜ | [**Few-shot / Zero-shot**：示例怎么帮模型「对齐格式」](./02-Few-shot-Zero-shot.md) | 能对比你的任务上哪种更稳 | `few shot prompting examples` `in-context learning` · 同上官方教程 | — |
| ⬜ | [**CoT / ReAct（概念）**：先知道思想；循环到模块 07 再写](./03-CoT-ReAct概念.md) | 能说清思想，现在不要实现 Agent Loop | `chain of thought prompting` `ReAct paper summary` · Anthropic CoT 章节 · [ReAct 论文摘要](https://arxiv.org/abs/2210.03629) | — |
| ⬜ | [**Prompt 版本管理**：Prompt 也是代码，要 diff、要回归](./04-Prompt-版本管理.md) | 知道改 Prompt 和改代码一样要可追溯 | `prompt versioning best practices` · LangSmith Prompt Hub 概念 · 工程博客 | — |
| ⬜ | [**本地产出**](./05-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./05-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：让模型稳定按照你的要求工作，而不是「有时候好有时候不好」。

**动手产出**：8–10 个不同类型的高质量 Prompt：提取、分类、总结、改写、分析、路由等。文件落在 `apps/01-chatgpt-mini/src/prompts.ts`（或同目录 `prompts/`），不要只躺在对话里。

**验收标准**
- [ ] 每个 Prompt 都有版本号和变更记录
- [ ] 每个 Prompt 至少用 5 个输入样本验证过稳定性
- [ ] 掌握 System / User / Assistant 三种角色的正确分工
- [ ] 能对比出 Zero-shot 和 Few-shot 在你的任务上的效果差异
- [ ] 有一个 Prompt 模板函数，支持变量注入且做了转义处理

**自测问题**：如何用 Prompt 减少幻觉？Few-shot 的示例应该怎么挑？System Prompt 和 User Prompt 里的指令冲突时模型听谁的？

**常见坑**：把 Prompt 当成玄学不断加「你必须！！！一定要！！！」，而不是改结构、加示例、加约束。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`few shot prompting` · `chain of thought` · Anthropic Prompt 官方

## 本地拆步

> 回填 `apps/01-chatgpt-mini`。

1. 新建 `src/prompts.ts`（或 `src/prompts/`），8–10 个 Prompt 落文件，不要只躺在对话里
2. 每个有版本号 + 至少 5 条样本
3. `index.ts` 接上 `system` + 模板函数（变量要转义）
