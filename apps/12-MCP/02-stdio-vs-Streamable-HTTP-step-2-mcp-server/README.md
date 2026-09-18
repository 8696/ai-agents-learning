# Streamable HTTP MCP Server · 第二步（step-2，Server 端）

Streamable HTTP 形态的 MCP Server：只 listen 一个 koa 端口（50134），浏览器状态页和 MCP endpoint 走同一个 koa（GET / 浏览器、POST /mcp MCP 协议）。这是 step-2 的两个 demo 之一（另一个是 Client demo）。

- **端口**：`50134`（浏览器 `http://127.0.0.1:50134/` 状态页；MCP endpoint = `http://127.0.0.1:50134/mcp`）
- **怎么跑**：`cd apps && yarn app:12-02-stdio-vs-http-step-2-mcp-server`
- **对应 demo**：Client 在 `02-stdio-vs-Streamable-HTTP-step-2-mcp-client/`
- **对应笔记**：[`docs/学习模块/12-MCP/02-stdio-vs-Streamable-HTTP.md`](../../../docs/学习模块/12-MCP/02-stdio-vs-Streamable-HTTP.md)

## 数据流

```text
浏览器
  ↓ GET /api/server-info
routes/server-info.ts
  ↓ getServerInfo()（读 transport.sessionId + process.pid）
ctx.body

浏览器
  ↓ POST http://127.0.0.1:50134/mcp  （远端 Client 走 HTTP）
routes/mcp-endpoint.ts（koa 路由）
  ↓ ctx.respond = false → transport.handleRequest(req, res, body)
NodeStreamableHTTPServerTransport
  ↓ McpServer 处理
  ↓ 返 JSON-RPC / SSE 响应
```

## 当前能做什么

1. 浏览器打开 `http://127.0.0.1:50134/`，看「我是 Server」状态：进程 ID、MCP endpoint URL、当前 session ID
2. 点「探测 MCP endpoint」：浏览器 GET `/api/server-info` 验证 Server 进程还活着
3. **另起** `yarn app:12-02-stdio-vs-http-step-2-mcp-client`（端口 50135），让 Client demo 连过来
4. Client 调工具 → HTTP POST 走到 50134/mcp（koa 同进程） → Server 处理 → 返结果

## 教学点

| 看哪里 | 看什么 |
| --- | --- |
| 状态卡里的 `serverPid` | 这个进程拥有 MCP endpoint（50134 同端口），不是被任何 Client 拥有 |
| 状态卡里的 MCP endpoint URL | Server 同 koa 端口暴露；任何 Client 用 HTTP 都能连 |
| 杀这个 Server 进程 | Client 进程继续在（HTTP 请求会失败，但 Client 进程不死） |
| 杀 Client 进程 | Server 不受影响 |

## 页面

- `GET /` 状态页：Server 自己 listen 端口展示
- `GET /health` 元信息（provider / model / transport）
- `GET /api/server-info` Server 实时状态
- `POST http://127.0.0.1:50134/mcp` 真 MCP endpoint（走 koa 路由，不再额外 listen 原生 http）