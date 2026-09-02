# Demo · AbortController · 客户端停 ≠ 服务端停（§5.3 React + koa）

对应小节：[docs/学习模块/02-LLM-API开发/03-AbortController.md](../../../docs/学习模块/02-LLM-API开发/03-AbortController.md)

## 端口

`50203`（§5.3.3 `5{MM}{SS}`）。可用 `PORT=50203 yarn app:02-03-abort-controller` 覆盖。

## 技术栈（§5.3）

- **后端**：koa + @koa/router + koa-static + @koa/bodyparser（**§5.3.5**：bodyParser 先 → router → serve）
- **前端**：HTML 内联 JSX 块（Tailwind 4 browser CDN + React 18.3.1 UMD + Babel Standalone 7.26.4）
- **JSX**：Babel Standalone 运行时转译，classic runtime → `React.createElement`
- **入口**：直接 `tsx server.ts`（无 `index.ts`，无 `app.tsx`，无 esbuild / importmap）
- **不引**：express / fastify / htm / preact / 任何打包器（vite/webpack）

## 数据流

```text
浏览器 GET  /                       → koa-static(./public) → index.html（HTML 内联 JSX）
                                  → 浏览器执行 type="text/babel" → Babel 转译 JSX → React.createElement
                                  → ReactDOM.createRoot(#root).render(<App />)
浏览器 POST /api/full                → koa router → bodyParser → ctx.request.body
                                  → ctx.respond=false → openai SDK stream:true（无 signal）→ SSE 帧 → 跑到底
浏览器 POST /api/cancel-after-frames → koa router → bodyParser → ctx.request.body
                                  → ctx.respond=false → openai SDK stream:true（带 signal）→ N 帧后 controller.abort() → AbortError → 发 aborted 帧
浏览器 POST /api/no-signal-abort     → koa router → bodyParser → ctx.request.body
                                  → ctx.respond=false → openai SDK stream:true（**故意不传** signal）→ 5s 后服务端 res.end() → SDK 仍在跑
```

## 怎么跑

```bash
cd apps
yarn install
yarn app:02-03-abort-controller
```

打开浏览器 `http://127.0.0.1:50203/`，页面有 3 个按钮。

## 看什么

| 按钮 | 端点 | 演示什么 | 看哪里 |
| --- | --- | --- | ------ |
| ① 流到底 | `POST /api/full` | **对照基线**：不取消，跑到底 | 帧数 / 耗时 / usage |
| ② 收 N 帧就停 | `POST /api/cancel-after-frames` | **客户端停**：服务端到 N 帧 abort；浏览器层 abort 也会走这里 | 帧数（明显少于①）/ `🛑 已 abort` 状态 |
| ③ 故意不传 signal | `POST /api/no-signal-abort` | **signal 没传会怎样**：5s 后 res.end()，但 SDK 不知情继续跑 | 帧数 / 后端"SKD 跑完"日志 / "usage 仍按 generated 计费"提示 |

**对照结论**：
- ① vs ②：cancel 帧数 < full 帧数 → 服务端确实停了（OpenAI 流式关 socket 后通常停继续扣费）
- ② vs ③：传 signal 能省 token + 能中止；不传 signal 服务端继续跑 = 钱继续扣

## §5.3.4 强制 id 实际值

- `#page-header`：React `<header>` 元素
- `#page-title`：`<h1>AbortController · 对照 Demo</h1>`
- `#status-pill`：`<StatusPill>`（idle/busy/ok/aborted/warn/error 六态 + model 文案）
- `#page-main`：`<main>` 容器
- `#controls`：3 按钮 + N 帧输入框（`#frames-input`）
- `#output`：3 端点运行结果按顺序追加的 RunCard 列表
- `#page-footer`：底部脚注（端口 / 协议 / 模型）

## 后端日志关键行

```
[/api/full]                  : ✅ 完成 | 帧数 N | usage M tokens
[/api/cancel-after-frames]   : 已收 K 帧 → controller.abort()  ← 服务端 abort
[/api/cancel-after-frames]   : 🛑 AbortError caught | 帧数 K | usage 未拿到（流提前结束）
[/api/no-signal-abort]       : 5s 到 → 强制 res.end()（**没传 signal，SDK 继续跑**）
[/api/no-signal-abort]       : SDK 跑完 | 共 N 帧 | usage M tokens  ← 即使客户端断了，token 仍算
[/api/no-signal-abort]       : ⚠️ 即使客户端 res.end()，SDK 已生成的 token 都计入 usage，钱照算
```

## 概念 / 取舍 / 踩坑

在 [03-AbortController.md](../../../docs/学习模块/02-LLM-API开发/03-AbortController.md)。
