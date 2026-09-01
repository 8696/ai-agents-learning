[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见 [apps/02-LLM-API开发/](../../../apps/02-LLM-API开发/) 各小节 README

# 模块 02 · LLM API 开发 ⭐⭐⭐⭐⭐

[← 01 AI & LLM 基础认知](../01-AI与LLM基础认知/README.md) · [03 Prompt Engineering →](../03-Prompt-Engineering/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/02-LLM-API开发/0X-XX/README.md` 为准。
> **代码落点**：`apps/02-LLM-API开发/0X-XX-{短名}/` 各小节最小可运行 Demo（[01-Streaming-SSE](../../../apps/02-LLM-API开发/01-Streaming-SSE/) · [02-协议-A-vs-B](../../../apps/02-LLM-API开发/02-协议-A-vs-B/) · [03-AbortController](../../../apps/02-LLM-API开发/03-AbortController/) · [04-Rate-Limit](../../../apps/02-LLM-API开发/04-Rate-Limit/)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ✅ | [**Streaming / SSE**：为什么 LLM 用 SSE 而不是一次返回整段](./01-Streaming-SSE.md) | 能说帧大概长什么样、和 WebSocket 怎么选 | `Server-Sent Events explained` `SSE vs WebSocket LLM` `text/event-stream` · MDN SSE · 厂商 Streaming 文档 | 暂无链接 |
| ✅ | [**协议 A vs B**：`chat.completions` 与 `messages.create` 的字段、role、usage 位置](./02-协议-A-vs-B.md) | 能对照说出差异，不要求背全字段 | `OpenAI chat completions vs Anthropic messages API` · 资源清单四家文档对照 | 暂无链接 |
| ✅ | [**AbortController**：取消后客户端停写、服务端可能仍在生成](./03-AbortController.md) | 知道两边各自发生什么 | `AbortController fetch node` `cancel streaming request` · MDN AbortController · Node fetch 文档 | 暂无链接 |
| ✅ | [**429 / Rate Limit**：为什么要指数退避；哪些错误不该重试](./04-Rate-Limit.md) | 能解释退避动机、区分可重试 / 不可重试 | `OpenAI rate limit exponential backoff` `API 429 retry` · 厂商 Rate Limit 文档 | 暂无链接 |
| ✅ | [**本地产出**](./05-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./05-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：从代码层面真正调用模型，而不是在网页里聊天。

**动手产出**：每条外部小节在 `apps/02-LLM-API开发/0X-XX/` 落最小可运行 Demo；本地产出对照本页验收。

**验收标准**
- [ ] 流式和非流式两种模式都实现了
- [ ] 前端/CLI 能逐字渲染流式输出
- [ ] 实现了中途取消（AbortController）
- [ ] 每次请求后能打印 input / output token 数和估算成本
- [ ] 处理了 429（限流）、超时、网络错误三种异常
- [ ] 至少实践过 **协议 A（openai）** 与 **协议 B（@anthropic-ai/sdk）**，能说清 `chat.completions` 与 `messages.create` 的差异（推荐先用同一 MiniMax Key 做 A/B 对照）

**自测问题**：SSE 和 WebSocket 在 LLM 场景下怎么选？流式响应中途出错怎么处理？如何统计一次对话的成本？

**常见坑**：只写 happy path，第一次遇到 429 就整个应用崩掉。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`SSE vs WebSocket LLM` · `rate limit exponential backoff`

## 本地拆步

> 前面外部条已按 `apps/02-LLM-API开发/0X-XX/` 各小节落了对应 Demo。本地产出做验收收口、补缺口（不新建 mini-app）。

1. `apps/02-LLM-API开发/01-Streaming-SSE/`：非流式模式 + 每次打印 usage / 估算成本（mock + /api/real + /api/blocking + /api/stream 四套对照）
2. 同小节 HTTP + SSE（已有 `yarn app:02-01-streaming-sse`）
3. AbortController：`apps/02-LLM-API开发/03-AbortController/` 三端点对照（流到底 / 收 N 帧就停 / 故意不传 signal）
4. 429 / 超时 / 网络错误三条分支：`apps/02-LLM-API开发/04-Rate-Limit/`（可重试 vs 不可重试；mock 五场景 + 真 API 单次）
5. 跑 `yarn app:02-02-protocol-ab`，对照协议 A vs B（同 MiniMax Key）
