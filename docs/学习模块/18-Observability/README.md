[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/18-Observability/{小节文件夹}/README.md`

# 模块 18 · Observability ⭐⭐⭐⭐⭐

[← 17 Agent Evaluation](../17-Agent-Evaluation/README.md) · [19 可靠性 / 成本 / 性能 →](../19-可靠性成本性能/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/18-Observability/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/18-Observability/{小节文件夹}/`（每条外部小节的最小可运行 Demo；详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**Trace / Span**：一次 Agent 执行 = 1 条 Trace，每步 LLM/Tool = Span](./01-Trace-Span.md) | 能画这层关系 | `OpenTelemetry trace span` `LLM observability tracing` · [Langfuse 文档](https://langfuse.com/docs) · OpenTelemetry 概念 | — |
| ⬜ | [**轨迹可视化**：在 Langfuse / LangSmith 里点到失败的那一步](./02-轨迹可视化.md) | 会用 UI 定位，不只会打 console.log | `LangSmith trace view` `debug agent steps` · LangSmith / Langfuse 截图教程 | — |
| ⬜ | [**本地产出**](./03-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./03-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：知道 Agent 为什么出错。

**动手产出**：给 Agent 加完整 Trace / Log（LangSmith 或 Langfuse）。

**验收标准**
- [ ] 每次 Agent 执行有唯一 trace id，能串起全链路
- [ ] 每个 LLM Call 和 Tool Call 都是一个 Span，记录输入、输出、耗时、Token
- [ ] 能在 UI 上可视化看到完整 Agent Trajectory
- [ ] 记录了成本：每次执行花了多少钱
- [ ] 出错时能定位到具体是哪一步、什么输入导致的
- [ ] 敏感信息在日志中做了脱敏

**自测问题**：如何排查一个 Agent 的错误？Trace 和 Span 的关系？你会记录哪些指标？

**常见坑**：只 log 最终结果，出问题时完全不知道中间发生了什么。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`OpenTelemetry trace span` · `LLM observability Langfuse`

## 本地拆步

> 落到 `apps/18-Observability/{小节文件夹}/`。Langfuse / LangSmith 二选一接上就停。

1. 每次执行一条 Trace；每个 LLM Call / Tool Call 是 Span（输入、输出、耗时、Token）
2. 能在 UI 点到失败的那一步；记下成本
3. 日志脱敏，Key / 用户隐私不要进 Trace
