[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / 项目 LEARNING.md

# 模块 06 · 多轮对话 & Context Engineering ⭐⭐⭐⭐⭐

[← 05 Tool Calling / Function Calling](../05-Tool-Calling/README.md) · [07 手写 Agent →](../07-手写Agent/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」仍以项目 `LEARNING.md` 为准（行号会变）。
> **项目当前地图**：[LEARNING.md](../../../apps/01-chatgpt-mini/LEARNING.md)（回填）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo与五个项目分离)）以及要不要把本条增量回填进五个项目（[§5.3](../../../AGENTS.md#53-五个项目按条增量回填本地产出是收口)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**Context vs Memory**：本次请求塞进 messages 的，vs 跨会话存起来的](./01-Context-vs-Memory.md) | 能区分「这轮发给模型什么」和「长期记得什么」 | `LLM context vs memory agent` `conversation history management` · [模块 06 常见坑](#验收) · [模块 10 Memory](../10-Memory/README.md) | — |
| ⬜ | [**压缩 / 摘要 vs 滑动窗口**：两种裁剪各丢哪类信息](./02-压缩-摘要-vs-滑动窗口.md) | 能对比丢了什么、什么场景用哪个 | `conversation summarization LLM` `sliding window vs summary context` · OpenAI Cookbook 上下文管理示例 | — |
| ⬜ | [**Token Budget**：给历史、给系统、给本轮各留多少](./03-Token-Budget.md) | 能设阈值，知道何时触发裁剪 | `token budget chatbot` `context window management` · tiktoken + 自己打印 full context | — |
| ⬜ | [**本地产出**](./04-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：理解「模型为什么会忘记，以及如何给模型正确的上下文」。

**动手产出**：一个具备多轮对话、上下文压缩的 Chat App。

**验收标准**
- [ ] 实现了 Token Budget 管理：超出阈值时自动裁剪或摘要
- [ ] 至少实现两种策略并能对比效果（滑动窗口 vs 摘要压缩）
- [ ] 能打印出「本次请求实际发给模型的完整上下文」用于调试
- [ ] 理解并实现了 Context 的选择性注入（不是把所有历史都塞进去）
- [ ] 有一个超长对话（50+ 轮）的测试场景并且不崩

**自测问题**：上下文太长怎么办？摘要压缩会丢失什么信息？如何决定哪些历史消息该保留？

**常见坑**：把「记忆」和「上下文」混为一谈。上下文是这一次请求发出去的内容，记忆是跨会话持久化的东西（模块 10）。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`context vs memory agent` · `conversation summarization LLM`

## 本地拆步

> 回到 `apps/01-chatgpt-mini`（不要改 `02-tool-agent`）。

1. messages 数组持久化；能打印「本次实际发给模型的完整上下文」
2. Token Budget：滑动窗口 vs 摘要，两种都实现并能对比
3. 50+ 轮对话不崩
