[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见 [apps/02-LLM-API开发/](../../../apps/02-LLM-API开发/) 各小节 README

# 模块 02 · LLM API 开发 ⭐⭐⭐⭐⭐

[← 01 AI & LLM 基础认知](../01-AI与LLM基础认知/README.md) · [03 Prompt Engineering →](../03-Prompt-Engineering/README.md)

> **小节进度、验收、动手落点**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/02-LLM-API开发/0X-XX/README.md` 为准。
> **代码落点**：按条 Demo 见上表链接。

## 小节进度

> 先外部（从上到下）→ 最后一行是**模块复盘**（只写 MD，不落代码，[AGENTS.md §7.3](../../../AGENTS.md#73-模块复盘进度表最后一行)）。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ✅ | [**Streaming / SSE**：为什么 LLM 用 SSE 而不是一次返回整段](./01-Streaming-SSE.md) | 能说帧大概长什么样、和 WebSocket 怎么选 | `Server-Sent Events explained` `SSE vs WebSocket LLM` `text/event-stream` · MDN SSE · 厂商 Streaming 文档 | 暂无链接 |
| ✅ | [**协议 A vs B**：`chat.completions` 与 `messages.create` 的字段、role、usage 位置](./02-协议-A-vs-B.md) | 能对照说出差异，不要求背全字段 | `OpenAI chat completions vs Anthropic messages API` · 资源清单四家文档对照 | 暂无链接 |
| ✅ | [**AbortController**：取消后客户端停写、服务端可能仍在生成](./03-AbortController.md) | 知道两边各自发生什么 | `AbortController fetch node` `cancel streaming request` · MDN AbortController · Node fetch 文档 | 暂无链接 |
| ✅ | [**429 / Rate Limit**：为什么要指数退避；哪些错误不该重试](./04-Rate-Limit.md) | 能解释退避动机、区分可重试 / 不可重试 | `OpenAI rate limit exponential backoff` `API 429 retry` · 厂商 Rate Limit 文档 | 暂无链接 |
| ✅ | [**思考 / Thinking**：协议里思考和正文怎么分、怎么开、追问时怎么回传](./05-思考.md) | 能讲清思考≠正文、A/B 怎么开、流式拆哪、追问历史怎么拼 | `extended thinking` `reasoning_split` MiniMax thinking · Anthropic thinking | 暂无链接 |
| ✅ | [**模块复盘**](./06-模块复盘.md) | 打开值班台能流式出草稿、停止刷新、终审一版，并看见用量 | — | [沉淀](./06-模块复盘.md) |

## 验收

> 写**模块复盘**时对照本节：复盘的「模块验收对答」表逐条抄这里。
> `coach complete` 勾复盘行前走 [AGENTS.md §7.3 闸门](../../../AGENTS.md#73-模块复盘进度表最后一行)（不查代码、不打 Demo 判断块）。

**一句话目标**：从代码层面真正调用模型，而不是在网页里聊天。

**代码落点**：按条 Demo 已落 01-Streaming-SSE / 02-协议-A-vs-B / 03-AbortController / 03-adapter-demo / 04-Rate-Limit / 05-思考。`yarn app:02-05-thinking-step-1` 看思考拆帧的细对照；429 实验仍在 `yarn app:02-04-rate-limit-step-1`。本模块无额外整合 APP。

**验收标准**
- [x] 流式（草稿）和非流式（终审）都在同一条值班路径里
- [x] 前端能逐字渲染流式输出
- [x] 实现了中途取消（AbortController）
- [x] 每次请求后能打印 input / output token 数和估算成本
- [x] 处理了 429（限流）、超时、网络错误三种异常
- [x] 至少实践过 **协议 A（openai）** 与 **协议 B（@anthropic-ai/sdk）**，能说清 `chat.completions` 与 `messages.create` 的差异

**自测问题**：SSE 和 WebSocket 在 LLM 场景下怎么选？流式响应中途出错怎么处理？如何统计一次对话的成本？

**常见坑**：只写 happy path，第一次遇到 429 就整个应用崩掉。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`SSE vs WebSocket LLM` · `rate limit exponential backoff`

## 动手落点

> 按条 Demo（01–05）已落；本模块无额外整合 APP。按条文件夹不删、不 import。

2. 按条入口仍可用：`02-01` … `02-05`
3. 思考正文拆帧的细对照：`yarn app:02-05-thinking-step-1`
