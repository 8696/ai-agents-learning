# Streamable HTTP MCP Client · 第二步（step-2，Client 端）

Streamable HTTP 形态的 MCP Client：连远端 HTTP MCP endpoint（`http://127.0.0.1:50134/mcp`），走 HTTP POST 调 MCP 协议。这是 step-2 的两个 demo 之一（另一个是 Server demo）。

- **Client koa 端口**：`50135`（浏览器 `http://127.0.0.1:50135/`，看「我是 Client」+ 调工具 UI）
- **连远端 endpoint**：`http://127.0.0.1:50134/mcp`（Server demo 自 listen，koa 同端口）
- **怎么跑**：`cd apps && yarn app:12-02-stdio-vs-http-step-2-mcp-client`
- **前置**：Server demo 必须先起来（`yarn app:12-02-stdio-vs-http-step-2-mcp-server`）
- **对应笔记**：[`docs/学习模块/12-MCP/02-stdio-vs-Streamable-HTTP.md`](../../../docs/学习模块/12-MCP/02-stdio-vs-Streamable-HTTP.md)

## 数据流

```text
浏览器
  ↓ POST /api/http/connect
routes/http-connect.ts
  ↓ getOrCreateClient()（首次才 connect）
lib/flow/mcp-http-client.ts
  ↓ new StreamableHTTPClientTransport(new URL(SERVER_URL))
  ↓ client.connect(transport)
  ↳ HTTP POST → http://127.0.0.1:50134/mcp（远端另一进程）
  ↳ Server 返回 mcp-session-id + capabilities
  ↓ 返 { sessionId, endpoint }

浏览器
  ↓ POST /api/http/list-tools
routes/http-list-tools.ts
  ↓ listTools() / callTool()
  ↳ HTTP POST 到远端 50134（带 mcp-session-id header）
  ↳ 远端 Server 进程处理 → JSON-RPC 响应 → SSE 流
  ↓ 返 result
```

## 当前能做什么

1. 浏览器打开 `http://127.0.0.1:50135/`，看「我是 Client」UI
2. 点「连远端吧台」：走 HTTP POST 到 50134/mcp 握手，返回 sessionId（首次才真连）
3. 点「看吧台菜单」：HTTP POST tools/list → 远端 Server 返 make_latte
4. 点「做一杯拿铁」：HTTP POST tools/call(make_latte) → 远端做拿铁 → 响应回
5. 点「看今日菜单 / 读今日菜单」：HTTP POST resources/list + read
6. **实验**：杀掉 Server demo（端口 50134 那条）→ Client 端再点调工具立刻拿到 connection refused / 404 → 证明 Server 死了 Client 不死，只是请求失败

## 教学点

| 看哪里 | 看什么 |
| --- | --- |
| `clientInfo.sessionId` | HTTP 协议层的 session 标识（来自 Server 端）；不是父子进程的 pid |
| `clientInfo.endpoint` | 写死到 `http://127.0.0.1:50134/mcp`；演示"Client 不拥有 Server" |
| 杀掉 Server demo（pid 11971 那个） | Client 不死；调工具立刻拿错误 |
| 杀 Client demo | Server 不受影响（继续在 50134 listen） |

## 页面

- `GET /` Client UI
- `GET /health` 元信息
- `POST /api/http/connect` 主动连远端
- `POST /api/http/list-tools` 远端列工具
- `POST /api/http/call-tool` 远端调工具
- `POST /api/http/list-resources` 远端列资源
- `POST /api/http/read-resource` 远端读资源