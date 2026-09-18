# stdio vs Streamable HTTP · 第一步（step-1）

stdio Transport 本地玩具：父进程（koa）真去 spawn 一个 tsx 子进程跑 `lib/mcp-server/server.ts`，父子之间通过 stdin/stdout 走 JSON-RPC。点完能看见一个真 pid。

- **端口**：`50133`（浏览器 `http://127.0.0.1:50133/`）
- **怎么跑**：`cd apps && yarn app:12-02-stdio-vs-http-step-1`
- **对应笔记**：[`docs/学习模块/12-MCP/02-stdio-vs-Streamable-HTTP.md`](../../../docs/学习模块/12-MCP/02-stdio-vs-Streamable-HTTP.md)

## 数据流

```text
浏览器
  ↓ POST /api/stdio/connect
routes/stdio-connect.ts
  ↓ getOrCreateClient()（首次才 spawn）
lib/flow/stdio-client.ts
  ↓ new StdioClientTransport({ command: "tsx", args: [server.ts] })
  ↓ client.connect(transport)
  ↳ spawn 子进程 lib/mcp-server/server.ts
  ↳ 子进程用 StdioServerTransport 走 stdin/stdout
  ↳ JSON-RPC initialize 握手
  ↓ 返 { pid, startedAt }

浏览器
  ↓ POST /api/stdio/list-tools（cupSize）
routes/stdio-list-tools.ts
  ↓ listTools() / callTool()
lib/flow/stdio-client.ts
  ↓ client.listTools() / client.callTool({ name, arguments })
  ↳ 父进程把 JSON-RPC 请求写到子进程 stdin
  ↳ 子进程从 stdin 读 → 处理 → 写回 stdout
  ↓ 返 result
```

## 当前能做什么

1. 点「启动吧台」：spawn 一个 tsx 子进程（首次才真起），返回子进程 pid
2. 点「看吧台菜单」：触发 MCP 协议 tools/list，返回 Server 注册的工具列表（目前只有 `make_latte`）
3. 点「做一杯拿铁」：触发 MCP 协议 tools/call(make_latte)，选杯型，返回"拿铁做好了"
4. 点「看今日菜单」：触发 MCP 协议 resources/list
5. 点「读今日菜单」：触发 MCP 协议 resources/read，读 `menu://today`

## 教学点

| 看哪里 | 看什么 |
| --- | --- |
| 点完「启动吧台」看 pid | 那是一个真进程号。父进程（koa）拥有这个子进程 —— 父进程死了它也死 |
| 看 `logs/{YYYY-MM-DD}.log` | `getOrCreateClient` 的五条日志完整记录 spawn + 握手；每个 tools/* 调用又是五条日志 |
| 试想：换台机器连这个 Server？ | 连不到 —— stdio 形态的 Server 没有端口、没有地址 |

## 页面

- `GET /` 总览：stdio Transport 全流程一站（启动 / 列工具 / 调工具 / 列资源 / 读资源）
