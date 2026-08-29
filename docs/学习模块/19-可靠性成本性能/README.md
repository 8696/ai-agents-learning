[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / 项目 LEARNING.md

# 模块 19 · 可靠性 / 成本 / 性能 ⭐⭐⭐⭐⭐

[← 18 Observability](../18-Observability/README.md) · [20 AI Security →](../20-AI-Security/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」仍以项目 `LEARNING.md` 为准（行号会变）。
> **项目当前地图**：`apps/04-research-agent/LEARNING.md`（回填）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**熔断**：连续失败 → 断开 → 半开探测 → 恢复，避免打爆下游](./01-熔断.md) | 能说出阈值、断开、恢复三步 | `circuit breaker pattern microservices` · Martin Fowler Circuit Breaker | — |
| ⬜ | [**Prompt Caching**：重复的长前缀（System / 工具定义）可以少花钱](./02-Prompt-Caching.md) | 知道缓存的是前缀、不是任意中间段 | `Anthropic prompt caching` `OpenAI cached tokens` · 厂商 Caching 文档 | — |
| ⬜ | [**Model Routing**：简单题走小模型；按**任务总成本**而不是单次单价](./03-Model-Routing.md) | 能举一个该路由的例子；能区分「按难度选模型」和「主模型挂了换备用」（降级） | `LLM model routing cascade` `small model large model routing` `model fallback` · 工程博客 · 自己 A/B | — |
| ⬜ | [**本地产出**](./04-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：从 Demo 变成 Production Agent。

**动手产出**：给 Agent 加重试、限流、缓存、成本统计。

**验收标准**
- [ ] 指数退避重试，区分可重试错误（429、5xx、超时）和不可重试错误
- [ ] 有超时控制，且超时后能正确清理资源
- [ ] 有并发控制和限流，不会打爆 API 配额
- [ ] 实现了缓存（相同输入不重复调用；了解 Prompt Caching）
- [ ] 实现了 Model Routing：简单任务用便宜模型，复杂任务用强模型
- [ ] 主模型不可用时能**降级**到备用模型（failover；和按难度路由不是同一件事）
- [ ] 有成本看板：按用户/按任务统计 Token 和花费
- [ ] 长任务改成异步队列 + 状态轮询，而不是长连接死等
- [ ] 关键操作有幂等性保证

**自测问题**：如何控制 Agent 成本？Model Routing 怎么设计？Agent 任务执行到一半服务重启了怎么办？

**常见坑**：为了省钱一律用最便宜的模型，结果 Agent 循环次数翻倍，总成本反而更高。**要按「完成任务的总成本」而不是「单次调用价格」来优化**。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`circuit breaker pattern` · `prompt caching LLM` · `model routing cascade`

## 本地拆步

> 回填 `apps/04-research-agent`。

1. 指数退避重试 + 超时清理；区分 429/5xx 与不可重试错误
2. 缓存 + 成本看板；Routing（按难度）和降级（failover）分开实现
3. 长任务进队列，不要占死 HTTP；关键操作幂等
