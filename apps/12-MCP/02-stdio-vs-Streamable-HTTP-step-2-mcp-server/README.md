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
  ↓ getServerInfo()（读 transport.sessionId + process.pid）+ getExpectedToken()
ctx.body

浏览器
  ↓ POST http://127.0.0.1:50134/mcp  （远端 Client 走 HTTP）
routes/mcp-endpoint.ts（koa 路由）
  ↓ 第一关：checkBearer(ctx.req.headers)  ← 鉴权在 transport 之前
  ↓ 不通过 → 直接写 HTTP 401 + WWW-Authenticate（JSON-RPC 还没开始）
  ↓ 通过 → ctx.respond = false → transport.handleRequest(req, res, body)
NodeStreamableHTTPServerTransport
  ↓ McpServer 处理
  ↓ 返 JSON-RPC / SSE 响应
```

## 鉴权（HTTP API Token）

MCP endpoint 需要在请求头里带 `Authorization: Bearer <token>`，否则返 HTTP 401（连 JSON-RPC 都没开始）。这是模块 12 验收「HTTP 至少做到 API Token」要求的最小闭环。

- **默认 token**：`demo-secret-token`（clone 后即跑；仅教学）
- **改 token**：环境变量 `MCP_API_TOKEN=<你的值>`，启动 Server 时设上
- **三种失败**：
  - 不带 Authorization 头 → HTTP 401 + `WWW-Authenticate: Bearer`（reason: `missing`）
  - 头不是 `Bearer <token>` 形状 → HTTP 401（reason: `malformed`）
  - token 与服务端期望不一致 → HTTP 401（reason: `wrong`）
- **通过**：进入 transport.handleRequest → McpServer 走 JSON-RPC；之后工具不存在 / 参数错 都是 JSON-RPC 业务错（HTTP 200 + `isError: true`），**不是 401**。两类失败页面上要能分开。
- **下一步**：缺口 2（按用户隔离）+ 缺口 3（OAuth 2.1）按 backlog 走。

## 按用户隔离（Token → userId 映射 + Server 强制过滤）

A5 把「不带 / 错 / 对 token」对照三态做出来——这只是「能不能进」。**生产上还要知道「你是谁」**：alice 不能看 bob 的工单、bob 不能看 alice 的、共享上帝令牌绕过过滤（反例）。

| 按钮（在 Client demo 顶部） | token | userId | isGod | 期望服务端返 |
| ---- | ----- | ------ | ----- | ------------ |
| 切换为 alice（普通用户） | `alice-secret` | alice | false | alice 自己 2 张工单 |
| 切换为 bob（普通用户） | `bob-secret` | bob | false | bob 自己 1 张工单 |
| 切换为 god（上帝令牌 · 反例） | `god-mode-token` | god | true | 全部 3 张工单（红字反例） |

- **机制**：服务端 [lib/flow/auth.ts](apps/12-MCP/02-stdio-vs-Streamable-HTTP-step-2-mcp-server/lib/flow/auth.ts) 的 `TOKEN_TO_USER` 把 token 映射成 `{ userId, isGod }`；route 层通过 `runWithUser(userId, () => transport.handleRequest(...))` 把 userId 注入 Node `AsyncLocalStorage`；[lib/flow/mcp-http-server.ts](apps/12-MCP/02-stdio-vs-Streamable-HTTP-step-2-mcp-server/lib/flow/mcp-http-server.ts) 的 `list_my_tickets` Tool handler 通过 `getCurrentUserId()` 读出来，按 userId 调 [lib/flow/tickets-store.ts](apps/12-MCP/02-stdio-vs-Streamable-HTTP-step-2-mcp-server/lib/flow/tickets-store.ts) 的 `listTicketsForUser(userId)` 过滤
- **每个响应都回 `[调用方] <userId>`**：make_latte / today-menu / customer_service_greeting / refund_response 四个 handler 都在返回 text 末尾拼 `getCurrentUserId()`，客户端可以直接对照身份
- **为什么用 AsyncLocalStorage**：模块级 `currentUserId` 变量在两个请求并发时会乱；ALS 是 Node 22 内置零依赖，并发安全
- **连接复用**：客户端用 SDK 自定义 fetch（`dynamicAuthFetch`），Authorization 头每次请求动态拼——切换身份不需要重建连接
- **跨小节对照**：跟模块 05 工具网关委托授权（用户 → Agent → 外部 HTTP 用谁的身份）、模块 11 Agent state（session 里挂 userId）、模块 20 安全审计（凭据轮换、最小权限）是同一类机制的**最底层**——把 userId 从 HTTP 层传到业务 handler

## OAuth 2.1 角色图 + 受众校验（A7）

每个 token 标了 audience，服务端 checkBearer 校验 `token.audience == "mcp"`。一把发给 "other-mcp" 的 token 拿到 "mcp" 端点来用 → 401 + WWW-Authenticate（OAuth 2.1 §5.2 标准形状）+ error_description body。

### 四种 401 失败

| reason | error（OAuth 2.1 标准值） | error_description 中文（body） | error_description 英文（WWW-Authenticate header） |
| ------ | ------------------------ | ----------------------------- | --------------------------------------------- |
| `missing` | `invalid_request` | 请求头里没有 Authorization —— OAuth 2.1 客户端必须在每次请求里带 Bearer token | missing Authorization header |
| `malformed` | `invalid_request` | Authorization 头不是「Bearer <token>」形状——OAuth 2.1 标准格式是 Bearer scheme | Authorization header is not in 'Bearer <token>' format |
| `wrong` | `invalid_token` | token 不在已知列表里——OAuth 2.1 客户端应该从授权服务器拿有效 token | token does not match any known credential |
| `wrong_audience` | `invalid_token` | audience mismatch: this token was issued for 'other-mcp', not 'mcp' | audience mismatch: this token was issued for 'other-mcp', not 'mcp' |

### 已知 token 清单

```ts
TOKEN_TO_USER = {
  "alice-secret":           { userId: "alice", isGod: false, audience: "mcp" },
  "bob-secret":             { userId: "bob",   isGod: false, audience: "mcp" },
  "god-mode-token":         { userId: "god",   isGod: true,  audience: "mcp" },
  "token-for-other-server": { userId: null,    isGod: false, audience: "other-mcp" },
}
```

**前三把发给本 MCP 服务端（realm="mcp"），第四把发给别的 MCP 服务端（realm="other-mcp"）**——演示 OAuth 2.1 防 confused deputy。

### 为什么 HTTP header 用英文 error_description

HTTP header 只允许 ASCII（RFC 7230 §3.2.6）。中文版完整 error_description 放 body 字段；WWW-Authenticate header 用 ASCII 短描述。这样 page 直接读 body 即可拿到中文错误，无需解析 header。

### 角色图（页面 ASCII 卡同款）

```
  用户（Resource Owner）                  授权服务器（Authorization Server）
       │                                              │
       │ 点「连接工单系统」                            │ 颁发 access token
       ▼                                              ▼
  ┌──────────────────────────────────────────────────────┐
  │ access token（含 aud=工单系统-mcp）                  │
  └──────────────────────────────────────────────────────┘
       │ 每次 HTTP POST 放进 Authorization: Bearer ...
       ▼
  MCP Client（Co-pilot / Cursor / 自己的 Agent）
       │ 转发带 Authorization 的请求
       ▼
  MCP Server（Resource Server，aud=mcp） ← 本 server
       │ ① checkBearer：解析 Bearer
       │ ② audience 校验：token.aud 必须等于本 server 的 realm
       │ ③ audience 不匹配 → 401 + WWW-Authenticate
       │ ③ audience 匹配 → runWithUser(userId) → Tool handler 按 userId 过滤
```

## 当前能做什么

1. 浏览器打开 `http://127.0.0.1:50134/`，看「我是 Server」状态：进程 ID、MCP endpoint URL
2. **每个 Tool / Resource / Prompt 响应都把当前 userId 写进 text 末尾 `[调用方] <userId>`**——客户端可对照身份是否被服务端正确识别
3. `list_my_tickets` Tool 按 userId 过滤工单；`userId === "god"` 绕过过滤看到全部（反例）
4. 客户端 demo 连过来后切 alice / bob / god，三种身份的工单对照
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