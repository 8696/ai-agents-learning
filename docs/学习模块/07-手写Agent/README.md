[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「模块复盘」MD / `apps/07-手写Agent/{小节文件夹}/README.md`

# 模块 07 · 手写 Agent ⭐⭐⭐⭐⭐ · 🔥 最关键模块

[← 06 多轮对话 & Context Engineering](../06-多轮对话与Context/README.md) · [08 RAG 基础 →](../08-RAG基础/README.md)

> **小节进度、验收、动手落点**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/07-手写Agent/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/07-手写Agent/{小节文件夹}/`（每条外部小节的最小可运行 Demo；详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行是**模块复盘**（只写 MD，不落代码，[AGENTS.md §7.3](../../../AGENTS.md#73-模块复盘进度表最后一行)）。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**Agent Loop / ReAct**：Reason → Act → Observe，以及停止条件](./01-Agent-Loop-ReAct.md) | 能画 Loop，能说出何时停 | `ReAct agent loop explained` `reason act observe agent` · [ReAct 论文](https://arxiv.org/abs/2210.03629) 摘要+图 · Yannic Kilcher 视频摘要 | — |
| ⬜ | [**先规划再执行 vs 一步步走**：两种策略的代价](./02-先规划再执行-vs-一步步走.md) | 知道什么时候值得先出计划 | `LLM agent planning` `plan and execute agent` · LangGraph 概念文档（只读概念） | — |
| ⬜ | [**死循环防护**：最大步数、超时、模型说停](./03-死循环防护.md) | 能列举至少 3 种停下来的条件 | `agent infinite loop prevention` · 自己调试日志 | — |
| ⬜ | [**模块复盘**](./04-模块复盘.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-模块复盘.md) |

## 验收

> 写**模块复盘**时对照本节：复盘的「模块验收对答」表逐条抄这里。
> `coach next` 勾复盘行前走 [AGENTS.md §7.3 闸门](../../../AGENTS.md#73-模块复盘进度表最后一行)（不查代码、不打 Demo 判断块）。

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

**给 AI 助手的特别提示**：这个模块是整条路线的分水岭。禁止任何 Agent 框架；按条可以写满本条 / 模块复盘这一刀，不要用框架代劳。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`ReAct agent loop` · `reason act observe` · ReAct 论文摘要

## 动手落点

> 只改 `apps/07-手写Agent/{小节文件夹}/`。禁止任何 Agent 框架。可以写满本模块这一刀。

1. `src/loop.ts`：while + 停止条件（答案 / 最大步数 / 超时 / 取消）
2. State 对象 + 每步 trajectory 打印
3. Tool 失败回传再试；仍失败则降级告诉用户
