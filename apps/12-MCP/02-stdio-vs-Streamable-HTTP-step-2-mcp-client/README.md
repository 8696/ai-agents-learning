# Streamable HTTP MCP Client · 第二步（step-2，Client 端）

Streamable HTTP 形态的 MCP Client：**一条连接走到底**，Authorization 头每次请求动态拼，不重建连接。这是 A6 教学点（按用户隔离）的可观察底层机制。

- **Client koa 端口**：`50135`（浏览器 `http://127.0.0.1:50135/`）
- **连远端 endpoint**：`http://127.0.0.1:50134/mcp`（Server demo 自 listen，koa 同端口）
- **怎么跑**：`cd apps && yarn app:12-02-stdio-vs-http-step-2-mcp-client`
- **前置**：Server demo 必须先起来（`yarn app:12-02-stdio-vs-http-step-2-mcp-server`）
- **对应笔记**：[`docs/学习模块/12-MCP/02-stdio-vs-Streamable-HTTP.md`](../../../docs/学习模块/12-MCP/02-stdio-vs-Streamable-HTTP.md)

## 数据流

```text
页面 mount
  → fetch("/api/http/connect")             ← 自动连一次（initialize 握手）
  → fetch("/api/http/set-token", token)    ← 默认登录为 alice（后续可切 bob / god）

用户点「做一杯拿铁」
  → fetch("/api/http/call-tool", { name, arguments })
routes/http-call-tool.ts
  → callTool(name, args)                   ← 走 SDK；SDK 内部 fetch → dynamicAuthFetch
lib/flow/mcp-http-client.ts
  → dynamicAuthFetch 读 getCurrentToken() → 拼 Authorization 头
  → fetch(input, { ...init, headers })
  → 远端 POST 127.0.0.1:50134/mcp

Server 端
  → routes/mcp-endpoint.ts
    → checkBearer(headers) → 拿到 userId
    → runWithUser(userId, () => transport.handleRequest(...))
  → McpServer 处理 tools/call(make_latte)
  → handler 内 getCurrentUserId() → 拼到 text 末尾：[调用方] <userId>
  → 返 200 + structuredContent

用户点「切换为 god」
  → fetch("/api/http/set-token", { token: "god-mode-token" })
    → setCurrentToken(...) — 只动 currentToken，不重建连接
  → 后续所有 MCP 请求自动带 god 的 Authorization 头
```

## 顶部「当前登录身份」选择器

页面 mount 时**自动连接**，默认登录为 **alice**。三个按钮切换身份：

| 按钮 | token | 期望身份 | list_my_tickets 看到 |
| ---- | ----- | -------- | --------------------- |
| 切换为 alice（普通用户） | `alice-secret` | alice | 自己 2 张 |
| 切换为 bob（普通用户） | `bob-secret` | bob | 自己 1 张 |
| 切换为 god（上帝令牌 · 反例） | `god-mode-token` | god | **全部 3 张**（标红） |

切换不重建连接——只动 `currentToken`，下次 MCP 调用通过 SDK 自定义 fetch 动态拼新 Authorization 头。

## 三个 MCP 模块（Tools / Resources / Prompts）

每个模块所有请求都带当前身份。每个 Tool / Resource / Prompt 响应**都把当前 userId 写进 text**：

| 模块 | 按钮 | 响应里会回 `[调用方] <userId>` |
| ---- | ---- | ------------------------------ |
| Tools | 列远端工具（tools/list） | ✓ |
| Tools | 做一杯拿铁（tools/call · make_latte） | ✓ |
| Tools | 看我自己的工单（list_my_tickets · 按身份过滤） | ✓ + structuredContent |
| Resources | 列远端资源（resources/list） | ✓ |
| Resources | 读今日菜单（resources/read menu://today） | ✓ |
| Prompts | 看预设话术模板（prompts/list） | ✓ |
| Prompts | 取客服开场白 / 退款话术（prompts/get） | ✓ |

## 教学点

| 看哪里 | 看什么 |
| --- | --- |
| 页面 mount 时自动 `connect`，无按钮 | Client → Server 一条连接走到底 |
| 顶部三个按钮（alice / bob / god） | 切换身份只动 currentToken，不重建连接 |
| 每个响应卡上的 `调用方 <userId>` | 服务端实际看到的身份 = 页面顶部选择的身份 |
| list_my_tickets 跨身份对照 | alice 2 / bob 1 / god 3（反例标红） |
| 切换身份后耗时几毫秒 | 连接复用，省 initialize 握手 |
| 底部「OAuth 2.1」按钮 | audience 不匹配 → 远端 401 + WWW-Authenticate（OAuth 2.1 §5.2 标准形状） |

## OAuth 2.1 角色图 + audience 不匹配演示（A7）

底部「OAuth 2.1 角色图 + Audience 受众校验」区：
- ASCII 角色图（用户 → 授权服务器 → MCP Client → MCP Server / Resource Server）
- **演示按钮**「用「发给别的 MCP server 的 token」试一次」：调 `/api/http/test-audience` 路由；路由用原生 fetch POST 远端 `/mcp`，硬编码 `token-for-other-server`（audience="other-mcp"）
- 远端 checkBearer 校验 audience 不匹配 → HTTP 401 + `WWW-Authenticate: Bearer realm="mcp", error="invalid_token", error_description="audience mismatch: this token was issued for 'other-mcp', not 'mcp'"` + body 里的中文 error_description
- 结果卡同时展示 **body + WWW-Authenticate header** 三栏对照

- **为什么 Client demo 端不存 token**：每次 fetch 浏览器带 Authorization 头，Client demo route 从请求头解 token → 通过 AsyncLocalStorage 注入 dynamicAuthFetch
- **Audience = 令牌发给谁 vs 服务端是谁 = 资源服务器**：OAuth 2.1 防 confused deputy 的核心机制；token 不能跨资源服务器乱用
- 跨小节对照：跟模块 05 工具网关委托授权（用户 → Agent → 外部 HTTP 用谁的身份）、模块 11 Agent state、模块 20 安全审计（凭据轮换、最小权限）是同一类机制的**最底层**

## 页面

- `GET /` Client UI（顶部「当前登录身份」选择器 + 三个 MCP 模块）
- `GET /health` 元信息
- `POST /api/http/connect` 自动连（页面 mount 触发）
- `POST /api/http/set-token` body `{ token }`：切换当前身份（只动 currentToken）
- `POST /api/http/list-tools` 远端列工具
- `POST /api/http/call-tool` body `{ name, arguments }`：调任意 Tool（make_latte / list_my_tickets）
- `POST /api/http/list-resources` 远端列资源
- `POST /api/http/read-resource` 远端读资源
- `POST /api/http/list-prompts` 远端列提示词模板
- `POST /api/http/get-prompt` body `{ name, arguments }`：调任意 Prompt
- `GET  /api/http/auth-info` 鉴权状态查询
