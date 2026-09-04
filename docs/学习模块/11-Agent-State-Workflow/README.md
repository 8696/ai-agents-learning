[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「模块复盘」MD / `apps/11-Agent-State-Workflow/{小节文件夹}/README.md`

# 模块 11 · Agent State / Workflow ⭐⭐⭐⭐⭐

[← 10 Memory](../10-Memory/README.md) · [12 MCP →](../12-MCP/README.md)

> **小节进度、验收、动手落点**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/11-Agent-State-Workflow/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/11-Agent-State-Workflow/{小节文件夹}/`（每条外部小节的最小可运行 Demo；详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行是**模块复盘**（只写 MD，不落代码，[AGENTS.md §7.3](../../../AGENTS.md#73-模块复盘进度表最后一行)）。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**状态机**：节点、边、条件路由；Agent 步骤 = 状态转移](./01-状态机.md) | 能画一张自己任务的状态图 | `finite state machine tutorial` `agent workflow state machine` · 任意 FSM 入门 · LangGraph State 文档 | — |
| ⬜ | [**Checkpoint / Durable Resume**：State 可序列化；恢复时不重复有副作用的 Tool](./02-Checkpoint-Durable-Resume.md) | 能解释「杀进程再起来」要保证什么 | `LangGraph checkpoint persistence` `workflow resume pattern` `durable execution agent` · LangGraph Persistence 文档 | — |
| ⬜ | [**Human-in-the-loop**：哪些操作必须人点头才能继续](./03-Human-in-the-loop.md) | 能举出必须暂停的例子（转账、删数据） | `human in the loop AI workflow` `approval gate agent` · Anthropic HITL 指南 | — |
| ⬜ | [**模块复盘**](./04-模块复盘.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-模块复盘.md) |

## 验收

> 写**模块复盘**时对照本节：复盘的「模块验收对答」表逐条抄这里。
> `coach complete` 勾复盘行前走 [AGENTS.md §7.3 闸门](../../../AGENTS.md#73-模块复盘进度表最后一行)（不查代码、不打 Demo 判断块）。

**一句话目标**：从简单 Agent 进入复杂 Agent 系统——能规划、能分支、能暂停、能恢复。

**动手产出**：一个可以暂停 / 恢复 / 人工确认的多步骤 Agent。

**验收标准**
- [ ] 有显式的 State 定义（TS 类型），而不是散落的变量
- [ ] 实现了条件路由：根据 State 决定下一步走哪个节点
- [ ] 实现了 Checkpoint：每步执行后持久化 State
- [ ] 进程杀掉重启后，能从上一个 Checkpoint 恢复继续执行
- [ ] **有副作用的 Tool 不会因 resume/重试而重复执行**（幂等，或按 tool_call id 去重）
- [ ] 实现了 Human-in-the-loop：危险操作前暂停，等待人工确认
- [ ] 至少有一处并行执行（两个独立任务同时跑）
- [ ] 能画出这个 Workflow 的状态图

**自测问题**：Checkpoint 如何工作？State 应该存什么、不该存什么？什么时候需要 Human-in-the-loop？杀掉进程后 resume，怎么避免把「已扣款 / 已发邮件」再做一次？

**常见坑**：State 里存了不可序列化的东西（函数、Stream、DB 连接），导致 Checkpoint 无法持久化。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`state machine workflow` · `human in the loop agent` · `durable execution agent` · LangGraph Checkpoint

## 动手落点

> 先手写进 `apps/11-Agent-State-Workflow/01-状态机/`；Checkpoint / Durable Resume 见 `02-Checkpoint-Durable-Resume/`；HITL 见 `03-Human-in-the-loop/`。

1. 显式 State 类型 + 条件路由；每步 Checkpoint
2. 杀进程能 resume；有副作用的 Tool 不重复执行
3. 危险操作 HITL。
