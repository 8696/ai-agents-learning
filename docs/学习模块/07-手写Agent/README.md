[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / 项目 LEARNING.md

# 模块 07 · 手写 Agent ⭐⭐⭐⭐⭐ · 🔥 最关键模块

[← 06 多轮对话 & Context Engineering](../06-多轮对话与Context/README.md) · [08 RAG 基础 →](../08-RAG基础/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」仍以项目 `LEARNING.md` 为准（行号会变）。
> **项目当前地图**：`apps/02-tool-agent/LEARNING.md`（回填）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。

| 状态 | 重点（学什么） | 够用就算过 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**Agent Loop / ReAct**：Reason → Act → Observe，以及停止条件](./01-Agent-Loop-ReAct.md) | 能画 Loop，能说出何时停 | `ReAct agent loop explained` `reason act observe agent` · [ReAct 论文](https://arxiv.org/abs/2210.03629) 摘要+图 · Yannic Kilcher 视频摘要 | — |
| ⬜ | [**先规划再执行 vs 一步步走**：两种策略的代价](./02-先规划再执行-vs-一步步走.md) | 知道什么时候值得先出计划 | `LLM agent planning` `plan and execute agent` · LangGraph 概念文档（只读概念） | — |
| ⬜ | [**死循环防护**：最大步数、超时、模型说停](./03-死循环防护.md) | 能列举至少 3 种停下来的条件 | `agent infinite loop prevention` · 自己调试日志 | — |
| ⬜ | [**本地产出**](./04-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：不用任何框架，自己实现 Agent 的核心循环。

**动手产出**：TS + Node.js 手写一个完整 Agent。推荐项目：待办 Agent（接 SQLite / Prisma）。

**验收标准**
- [ ] **完全没有引入任何 Agent 框架**
- [ ] 实现了完整的 Reason → Act → Observe 循环
- [ ] 有明确的停止条件：得到最终答案 / 达到 Max Iterations / 超时 / 用户取消
- [ ] Tool 执行失败时能重试，重试仍失败能优雅降级并告诉用户
- [ ] 有 Agent State 对象，记录当前轮次、已调用工具、累计 Token
- [ ] 能打印出完整的执行轨迹（trajectory），每一步的思考和动作都可见
- [ ] 支持中途取消
- [ ] 能画出这个 Agent 的完整流程图

**自测问题**：Agent 核心循环是什么？ReAct 和纯 Tool Calling 的区别是什么？如何防止 Agent 陷入死循环？Agent 的 State 应该包含什么？

**常见坑**：写成一个「调一次工具就结束」的伪 Agent。真正的 Agent 循环必须能连续多轮调用工具直到任务完成。

**给 AI 助手的特别提示**：这个模块是整条路线的分水岭。我卡住时请给伪代码和调试思路，**不要给完整实现**。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`ReAct agent loop` · `reason act observe` · ReAct 论文摘要

## 本地拆步

> 只改 `apps/02-tool-agent`。禁止任何 Agent 框架。卡住给伪代码，不要完整实现。

1. `src/loop.ts`：while + 停止条件（答案 / 最大步数 / 超时 / 取消）
2. State 对象 + 每步 trajectory 打印
3. Tool 失败回传再试；仍失败则降级告诉用户
