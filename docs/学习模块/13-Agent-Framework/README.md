[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/13-Agent-Framework/01-{短名}/README.md`

# 模块 13 · Agent Framework ⭐⭐⭐⭐

[← 12 MCP](../12-MCP/README.md) · [14 Multi-Agent →](../14-Multi-Agent/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/13-Agent-Framework/01-{短名}/README.md` 为准。
> **代码落点**：`apps/13-Agent-Framework/01-{短名}/`（每条外部小节的最小可运行 Demo；详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**框架解决什么**：对照自己手写的 Loop / State，看它省了什么、藏了什么](./01-框架解决什么.md) | 能列「省了 / 多了」各 3 条 | `LangGraph vs handwritten agent` `Vercel AI SDK useChat` · 各框架 Getting Started · 模块 07 自己的代码 | — |
| ⬜ | [**State Graph**：用图表达工作流，和手写 if/else 循环的差别](./02-State-Graph.md) | 能对照模块 07/11 的代码逐条 diff | `LangGraph tutorial state graph` · [LangGraph.js 文档](https://langchain-ai.github.io/langgraphjs/) | — |
| ⬜ | [**Agents as Tools vs Handoff**：当工具调用（调用方还在）vs 任务移交（控制权换人）](./03-Agents-as-Tools-vs-Handoff.md) | 能一句话划界；实现放到模块 14 | `agents as tools langchain` `agent handoff vs tool` · 模块 14 卡片 | — |
| ⬜ | [**Dify 等编排产品**：体验即可，不当学习主线](./04-Dify-等编排产品.md) | 能讲：它替你藏了 Loop/State | `Dify agent workflow` · Dify 官方入门（1h 内） | — |
| ⬜ | [**本地产出**](./05-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./05-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：学会用框架把前面自己实现的东西工程化。

**动手产出**：用框架重构自己的 Agent。推荐顺序：Vercel AI SDK（优先）→ LangChain.js + LangGraph.js（核心）→ Mastra / OpenAI Agents SDK（体验）。

**验收标准**
- [ ] 用 Vercel AI SDK 重写模块 07 的 Agent，前端用 `useChat` 接上
- [ ] 用 LangGraph.js 重写模块 11 的有状态 Workflow
- [ ] **能逐条列出手写版和框架版的差异**，并解释框架为什么这么设计
- [ ] 至少踩过一次框架的坑，并能说清它的抽象在什么场景下不合适
- [ ] 能回答「这个项目为什么选这个框架」
- [ ] 能区分 **Agents as Tools**（把另一个 Agent 当工具调用，调用方仍在）和 **Handoff**（任务移交，控制权换人）；本模块认知即可，实现放到模块 14
- [ ] **（不当主线）** 用 Dify 或同类产品搭一条最小工作流，能讲清：它替你藏了哪些循环/状态，和模块 07 手写版差在哪

**自测问题**：为什么选这个框架？LangGraph 的 State / Checkpoint 如何工作？框架的抽象在什么时候会成为负担？Dify 和手写 Agent 各适合什么？Agents as Tools 和 Handoff 差在哪？

**常见坑**：见 [2.6.2](../../03-学习路线.md#262-不要框架驱动学习)「框架驱动学习」。学框架的目的是**加速交付**，不是**理解原理**，原理在模块 07 就该学完了。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`LangGraph state graph` · `Vercel AI SDK useChat` · 对照模块 07 手写版

## 本地拆步

> 只落到 `apps/13-Agent-Framework/01-{短名}/`，不要改掉 `07` 的手写循环。

1. 用 Vercel AI SDK 重写一版 Agent（前端可用 `useChat`）
2. 用 LangGraph.js 重写模块 11 的有状态 Workflow
3. 沉淀里列出「手写 vs 框架」至少 3 条差异；Dify 只体验、能讲藏了什么
