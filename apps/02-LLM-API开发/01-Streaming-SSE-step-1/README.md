# Demo · Streaming / SSE（§5.3）

对应：[01-Streaming-SSE](../../../docs/学习模块/02-LLM-API开发/01-Streaming-SSE-step-1.md)

**端口 50201** · `yarn app:02-01-streaming-sse-step-1`

```text
/                      总览
/pages/simulated.html  模拟 SSE（不需要 Key）
/pages/blocking.html   流式 vs 一次性 TTFT
/pages/real.html       真实模型原样转发 chunk
```

## 数据流

```text
GET /api/stream   → 11 帧 × 200ms → [DONE]
GET /api/blocking → 等 2.2s 再给整句
GET/POST /api/real → 上游 stream:true，chunk 原样写成 SSE
```

一帧 ≠ 一个 token。模拟版每帧 1 字符是教学简化。

## 对应学习沉淀

[docs/学习模块/02-LLM-API开发/01-Streaming-SSE-step-1.md](../../../docs/学习模块/02-LLM-API开发/01-Streaming-SSE-step-1.md)
