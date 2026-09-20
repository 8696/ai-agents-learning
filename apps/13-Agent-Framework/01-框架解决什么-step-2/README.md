# 框架解决什么 · step-2

对应小节：[docs/学习模块/13-Agent-Framework/01-框架解决什么.md](../../../docs/学习模块/13-Agent-Framework/01-框架解决什么.md)

**端口**：`50140`（浏览器 [http://127.0.0.1:50140/](http://127.0.0.1:50140/)）

**怎么跑**：`cd apps && yarn app:13-01-framework-solves-what-step-2`

## 现在能做什么

- 首页 `/`：基础聊天页（`@ai-sdk/react` 的 `useChat` + 后端 `streamText`）。无工具调用，对照 step-1 用同页那一版看清「不带 make_latte」的样子。
- 子页 `/pages/reasoning-extract.html`：推理内容统一处理。同句 query 走两条流——左不开 middleware（纯文本流，思考留在 text 里）；右开 `extractReasoningMiddleware`（UI 消息流，思考拆成独立段）。

## 子页

| 路径 | 演示什么 |
| --- | --- |
| `index.html` | 基础聊天（系统提示词可改 + 多轮 + 4 个控件） |
| `pages/reasoning-extract.html` | 推理内容统一处理（左右对照） |
- 系统提示词 textarea：默认「通用中文助手」，用户可改。下一次发送时随 `body.system` 一起送到服务端。
- 四个控件：发送、取消请求（`stop`）、重新生成（`regenerate`）、清空对话；每条消息右侧可单独删除。
- 多轮：`useChat` 自动累计 messages；改系统提示词后历史不清空，下一条按新提示词走。

## 数据流

```text
用户输入 + 系统提示词（textarea）
  └─ POST /api/basic-chat
       body = { system: <systemPrompt>, messages: UIMessage[] }
         ↓
       lib/flow/basic-chat.ts → streamText({ system, messages })
         ↓
       本地不再有 while；流式拆帧、abort、regenerate 都在 AI SDK 里
         ↓
       toUIMessageStream → pipeUIMessageStreamToResponse → Node 的 ServerResponse
         ↓
       浏览器里 useChat 拆帧 → React 渲染
```

依赖在 `apps/package.json`：`ai`、`@ai-sdk/openai`、`@ai-sdk/react`。