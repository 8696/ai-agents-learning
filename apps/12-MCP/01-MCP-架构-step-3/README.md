# MCP 架构 · 第三步（step-3）

拓扑 + 解耦：1 宿主 · 2 客户端 · 2 服务端（client-1 ↔ server A · client-2 ↔ server B）+ 切换宿主接入（自建值班台 / Cursor）。本步不调大模型。

- **端口**：`50132`（浏览器 `http://127.0.0.1:50132/`）
- **怎么跑**：`cd apps && yarn app:12-01-mcp-architecture-step-3`
- **对应笔记**：[`docs/学习模块/12-MCP/01-MCP-架构.md`](../../../docs/学习模块/12-MCP/01-MCP-架构.md)
- **承接**：step-1（各原语独立走一遍）已锁 ✅；step-2（三原语同一轮对照）跑通；本步拆两台服务端 + 一对一专线 + 解耦。

## 数据流

```text
URL 路径区分 serverId —— 一对一专线由 URL 表达：
  客户端 1 → POST /api/mcp/ticket/{initialize,tools-list,tools-call}
  客户端 2 → POST /api/mcp/kb/{initialize,resources-list,resources-read,prompts-list,prompts-get}

请求头区分 hostId：
  X-MCP-Host-Id: agent-coffee  | agent-cursor

服务端 catalog 按 serverId 选能力：
  ticket：tools = [make_latte, create_ticket]
  kb：resources = [today-menu, allergy-info, policy] + prompts = [refund-script]
```

## 当前能做什么

1. 切换顶部「宿主标识」（自建值班台 / Cursor）—— 影响所有请求的 `X-MCP-Host-Id` 头
2. 点「① 初始化」：左栏 client-1 调 ticket/initialize，右栏 client-2 调 kb/initialize
3. 左栏单跑：tools/list → create_ticket（建工单，工单号 T-XXXX）
4. 右栏单跑：resources/list → resources/read policy → prompts/list → prompts/get refund-script
5. 切换 host 后重新点 ①：服务端日志区分两条接入，但 tools/list 响应完全相同（工具定义来自服务端 catalog）

## 页面 + 路由

| | |
| --- | --- |
| `GET /pages/topology.html` | 拓扑 + 解耦（唯一页面） |
| `POST /api/mcp/ticket/initialize` | ticket server 的 initialize |
| `POST /api/mcp/ticket/tools-list` | ticket server 的 tools/list |
| `POST /api/mcp/ticket/tools-call` | ticket server 的 tools/call |
| `POST /api/mcp/kb/initialize` | kb server 的 initialize |
| `POST /api/mcp/kb/resources-list` | kb server 的 resources/list |
| `POST /api/mcp/kb/resources-read` | kb server 的 resources/read |
| `POST /api/mcp/kb/prompts-list` | kb server 的 prompts/list |
| `POST /api/mcp/kb/prompts-get` | kb server 的 prompts/get |
| `GET /health` | 环境元信息 |
| `GET /api/force-error` | 第二类错误（5xx 演示） |