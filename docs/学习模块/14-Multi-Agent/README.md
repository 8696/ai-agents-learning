[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/14-Multi-Agent/{小节文件夹}/README.md`

# 模块 14 · Multi-Agent ⭐⭐⭐⭐

[← 13 Agent Framework](../13-Agent-Framework/README.md) · [15 Browser / Computer Agent →](../15-Browser-Computer-Agent/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/14-Multi-Agent/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/14-Multi-Agent/{小节文件夹}/`（详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**Supervisor 模式**：谁分派、谁执行、怎么交还](./01-Supervisor-模式.md) | 能画一张分工图 | `multi agent supervisor pattern` `orchestrator worker LLM` · LangGraph Multi-Agent 示例 · [microsoft/ai-agents-for-beginners](https://github.com/microsoft/ai-agents-for-beginners) | — |
| ⬜ | [**多 Agent 成本**：多一次交接就多一轮 Token；要有自己的数字](./02-多-Agent-成本.md) | 能对比单 Agent vs 多 Agent 的用量 | `multi agent token cost` · 自己实验数据 | — |
| ⬜ | [**A2A**：MCP 连工具，A2A 连 Agent；本仓库只要求认知](./03-A2A.md) | 能说清边界，不必实现 | `A2A protocol` `Agent2Agent vs MCP` · [a2a-protocol.org](https://a2a-protocol.org) | — |
| ⬜ | [**本地产出**](./04-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：理解什么时候应该多 Agent，什么时候不应该。

**动手产出**：Researcher + Writer + Reviewer 三角色协作系统。

**验收标准**
- [ ] 实现了 Supervisor / Worker 模式
- [ ] 实现了 Agent Handoff（任务移交）
- [ ] 有 Shared State，多个 Agent 能读写同一份上下文
- [ ] **做了成本和延迟对比**：同一任务单 Agent vs 多 Agent，Token 差多少、耗时差多少
- [ ] 能给出一个明确结论：什么场景多 Agent 值得，什么场景是过度设计
- [ ] **A2A 认知（不必实现）**：能一句话说清 MCP = Agent→工具，A2A = Agent→Agent（发现、委派、任务生命周期）

**自测问题**：多 Agent 什么时候比单 Agent 更好？如何设计分工？MCP 和 A2A 解决的是同一层问题吗？多 Agent 的成本问题怎么控制？

**常见坑**：为了炫技把简单任务拆成 5 个 Agent，成本翻 5 倍效果还更差。多 Agent 的合理动机是**上下文隔离**和**专业化分工**，不是「听起来更高级」。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`multi agent supervisor pattern` · `multi agent token cost` · `A2A protocol vs MCP`

## 本地拆步

> 落到 `apps/14-Multi-Agent/{小节文件夹}/`。

1. Supervisor + Researcher / Writer / Reviewer；实现 Handoff + Shared State
2. 同一任务再打一版单 Agent，记下 Token 和耗时
3. A2A 只写进沉淀（MCP = Agent→工具，A2A = Agent→Agent），不实现协议
