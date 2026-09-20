# 框架解决什么 · step-1

对应小节：[docs/学习模块/13-Agent-Framework/01-框架解决什么.md](../../../docs/学习模块/13-Agent-Framework/01-框架解决什么.md)

**端口**：`50139`（浏览器 [http://127.0.0.1:50139/](http://127.0.0.1:50139/)）

**怎么跑**：`cd apps && yarn app:13-01-framework-solves-what-step-1`

## 现在能做什么

- 首页 `/`：手写 `while`，同一句「来一杯中杯热拿铁。」，轨迹里能数圈、能看见 `make_latte`。
- 子页 `/pages/framework.html`：同一句话交给 Vercel AI SDK 的 `generateText`。业务文件里没有 `while`。
- 试验子页 `/pages/use-chat.html`：导入映射（import map）+ Babel 把 JSX 翻成 `createElement`，试用官方 `useChat`，走新路由 `POST /api/framework-chat`。原来的框架页和 `/api/framework-loop` 没改。

## 数据流

```text
客人原话
  ├─ POST /api/handwritten-loop  → lib/flow/handwritten-loop.ts（你写的 while）
  ├─ POST /api/framework-loop    → lib/flow/framework-loop.ts（generateText，库内部转圈）
  └─ POST /api/framework-chat    → lib/flow/framework-chat.ts（streamText，推界面消息流）
         ↓
      本地函数 executeMakeLatte（不是真咖啡机）
         ↓
      页面：请求参数 / 每一圈或流式正文 / 最终对客人说的话
```

依赖在 `apps/package.json`：`ai`、`@ai-sdk/openai`。顶部直接 `import`，不再动态加载。
