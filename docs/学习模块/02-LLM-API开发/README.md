[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见 [apps/02-LLM-API开发/](../../../apps/02-LLM-API开发/) 各小节 README

# 模块 02 · LLM API 开发 ⭐⭐⭐⭐⭐

[← 01 AI & LLM 基础认知](../01-AI与LLM基础认知/README.md) · [03 Prompt Engineering →](../03-Prompt-Engineering/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/02-LLM-API开发/0X-XX/README.md` 为准。
> **代码落点**：按条 Demo 见上表链接。本地产出 Demo APP：[`06-本地产出`](../../../apps/02-LLM-API开发/06-本地产出/)（`50206`）。

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是本模块小 APP（把已学能力串起来，不 import 其它小节），不是再讲一节新概念、也不是从零灌代码（[AGENTS.md §5.4](../../../AGENTS.md#54-模块小-app本地产出行)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ✅ | [**Streaming / SSE**：为什么 LLM 用 SSE 而不是一次返回整段](./01-Streaming-SSE.md) | 能说帧大概长什么样、和 WebSocket 怎么选 | `Server-Sent Events explained` `SSE vs WebSocket LLM` `text/event-stream` · MDN SSE · 厂商 Streaming 文档 | 暂无链接 |
| ✅ | [**协议 A vs B**：`chat.completions` 与 `messages.create` 的字段、role、usage 位置](./02-协议-A-vs-B.md) | 能对照说出差异，不要求背全字段 | `OpenAI chat completions vs Anthropic messages API` · 资源清单四家文档对照 | 暂无链接 |
| ✅ | [**AbortController**：取消后客户端停写、服务端可能仍在生成](./03-AbortController.md) | 知道两边各自发生什么 | `AbortController fetch node` `cancel streaming request` · MDN AbortController · Node fetch 文档 | 暂无链接 |
| ✅ | [**429 / Rate Limit**：为什么要指数退避；哪些错误不该重试](./04-Rate-Limit.md) | 能解释退避动机、区分可重试 / 不可重试 | `OpenAI rate limit exponential backoff` `API 429 retry` · 厂商 Rate Limit 文档 | 暂无链接 |
| ✅ | [**思考 / Thinking**：协议里思考和正文怎么分、怎么开、追问时怎么回传](./05-思考.md) | 能讲清思考≠正文、A/B 怎么开、流式拆哪、追问历史怎么拼 | `extended thinking` `reasoning_split` MiniMax thinking · Anthropic thinking | 暂无链接 |
| ✅ | [**本地产出**](./06-本地产出.md) | 打开值班台能流式出草稿、停止刷新、终审一版，并看见用量 | — | [沉淀](./06-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：从代码层面真正调用模型，而不是在网页里聊天。

**动手产出**：豆谷值班台：`apps/02-LLM-API开发/06-本地产出/`（`yarn app:02-06-api-lab`，端口 `50206`）。打开后：贴客户问句 → 流式草稿 → 可选协议 B 终审。按条 Demo 仍保留；思考拆帧细对照仍用 `yarn app:02-05-thinking`。协议开关和故意 429 不去首页。

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

## 本地拆步

> 本地产出 = 豆谷值班台。按条文件夹不删、不 import。

1. `yarn app:02-06-api-lab` → `http://127.0.0.1:50206/`
2. 按条入口仍可用：`02-01` … `02-05`
3. 思考正文拆帧的细对照：`yarn app:02-05-thinking`
