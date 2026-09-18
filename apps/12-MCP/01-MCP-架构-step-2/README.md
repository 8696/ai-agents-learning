# MCP 架构 · 第二步（step-2）

三原语对照：同一轮退款里，政策 / 话术 / 建单同时出现，三栏独立请求，对照三种控制权（应用 / 用户 / 模型）。本步不调大模型。

- **端口**：`50131`（浏览器 `http://127.0.0.1:50131/pages/compare.html`）
- **怎么跑**：`cd apps && yarn app:12-01-mcp-architecture-step-2`
- **对应笔记**：[`docs/学习模块/12-MCP/01-MCP-架构.md`](../../../docs/学习模块/12-MCP/01-MCP-架构.md)
- **承接**：[step-1 已锁 ✅](../01-MCP-架构-step-1/README.md) — step-1 是三原语各自独立走一遍；本步把三种原语放进同一轮对照。

## 数据流

```text
① 初始化 → POST /api/mcp/initialize → capabilities { tools, resources, prompts }
左栏（resource · 应用拉）：POST /api/mcp/resources-read { uri: "policy://return-2026" } → resources/read → result.contents[0].text（政策正文）
中栏（prompt · 用户点）：POST /api/mcp/prompts-get { name: "refund-script", arguments } → prompts/get → result.messages（user + assistant 话术）
右栏（tool · 模型调）：POST /api/mcp/tools-call { name: "create_ticket", arguments } → tools/call → result.content + structuredContent（真建工单）
```

## 当前能做什么

1. 填「订单号」+「退款原因」
2. 点「① 初始化」，看见 capabilities 三扇门全开
3. 点「② 三栏对照」或单跑任一栏按钮，看三种原语同时跑起来：
   - 左栏：拿到 2026 退货政策（无副作用）
   - 中栏：拿到退款话术消息数组（无副作用）
   - 右栏：真建一张工单 T-XXXX（有副作用）
4. 底部控制权对照表看「谁发起 / 方法 / 副作用」三栏差异

## 页面 + 路由

| | |
| --- | --- |
| `GET /pages/compare.html` | 三原语对照（唯一页面） |
| `POST /api/mcp/initialize` | initialize |
| `POST /api/mcp/resources-read` | resources/read 政策 |
| `POST /api/mcp/prompts-get` | prompts/get 话术 |
| `POST /api/mcp/tools-call` | tools/call 建工单 |
| `GET /health` | 环境元信息 |
| `GET /api/force-error` | 第二类错误（5xx 演示） |