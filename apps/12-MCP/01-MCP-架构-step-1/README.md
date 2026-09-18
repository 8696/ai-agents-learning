# MCP 架构 · 第一步（step-1）

最小可运行：总览页做初始化（initialize）和工具发现（tools/list）；子页再调用工具（tools/call · 真去做一杯拿铁）。本步不调大模型。资源、提示词模板先不加。

- **端口**：`50129`（浏览器 `http://127.0.0.1:50129/`）
- **怎么跑**：`cd apps && yarn app:12-01-mcp-architecture-step-1`
- **对应笔记**：[`docs/学习模块/12-MCP/01-MCP-架构.md`](../../../docs/学习模块/12-MCP/01-MCP-架构.md)

## 数据流

```text
总览 ① 初始化 → POST /api/mcp/initialize → JSON-RPC initialize → capabilities.tools
总览 ② 工具发现 → POST /api/mcp/tools-list → JSON-RPC tools/list → result.tools
子页 ③ 调用工具 → POST /api/mcp/tools-call → JSON-RPC tools/call → result.content
```

## 当前能做什么

1. 总览页：点「初始化」，看见 capabilities.tools（类似于问吧台开门了没）
2. 总览页：再点「工具发现」，看见 `make_latte`（拿铁）
3. 子页：按 ① → ② → ③，看见 `tools/call` 的响应里写着拿铁做好了

## 页面

- `GET /` 总览：初始化与工具发现
- `GET /pages/tools-call.html` 子页：调用工具
