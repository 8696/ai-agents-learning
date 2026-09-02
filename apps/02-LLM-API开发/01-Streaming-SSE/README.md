# Demo · Streaming / SSE（§5.3 React + koa 完整版）

对应：[模块 02 · LLM API 开发](../../../docs/学习模块/02-LLM-API开发/01-Streaming-SSE.md)

**端口**：`50201` · 浏览器打开 `http://127.0.0.1:50201/`（由 `PORT` 环境变量覆盖）。

本条必须看见的：
1. 一帧 = `data: <内容>\n\n`（空行收帧）
2. 浏览器 `fetch + getReader` 流式读，按 `\n\n` 切帧，累加 `delta.content`
3. 结束帧 `data: [DONE]\n\n`
4. 流式 vs 一次性 在 TTFT 上的体感差异
5. **真实 LLM 的 batching 行为**：每帧可能含 1～多个 token 解码后的字符串（模拟版每帧 1 字符、真实版不一一对应）

## 跑法

```bash
cd apps
yarn install
yarn app:02-01-streaming-sse
```

跑起来后**两个窗口对照看**：

- **浏览器**打开 `http://127.0.0.1:50201/`，页面有三个按钮：
  - 「流式」：调 `/api/stream`（模拟 SSE，每 200ms 一帧、共 11 帧）
  - 「一次性」：调 `/api/blocking`（攒齐 2.2s 再一次返回）
  - 「真实模型」：调 `/api/real`（**真正调线上 MiniMax / 智谱 / OpenAI**，看真实 batching）

  前端能看到**打字机效果**（`delta.content` 逐字累加到 DOM）+ TTFT / 总耗时 / **帧数 + token 数**（真实模型按钮才有）。

- **后端控制台**同步打印每一帧：
  - 模拟版：`SSE 帧 #1: data: {...}`
  - **真实版：`/api/real 真实 chunk #1: {...}` —— OpenAI 原始 chunk 全文**，含 `id` / `object` / `model` / `created` / `choices[].delta` / `choices[].finish_reason` / `usage`。

`Ctrl+C` 退出。

## 三个接口对照

| 接口 | 数据源 | 流式 | 调 API | 帧频率 | 帧 content 长度 |
| --- | ------ | --- | ------ | ------ | --------------- |
| `/api/stream` | 本地模拟 | ✅ | ❌ | 固定 200ms/帧 | **每帧 1 字符**（教学简化） |
| `/api/blocking` | 本地模拟 | ❌ | ❌ | — | 一次返回 |
| `/api/real` | **线上模型** | ✅ | ✅ | 看厂商 batching | **每帧可能含多 token**（真实行为） |

`/api/real` 跑前需要在 `apps/.env` 填 `MINIMAX_API_KEY`（或智谱 / OpenAI Key——只要兼容 OpenAI 协议即可），否则会返回 500 + Key 未配置错误。模拟版两个接口不依赖 Key。

> **`/api/real` 原样转发** OpenAI 真实 chunk JSON 到前端，**不做任何字段提取或包层**。前端 `fetch` + `getReader` 拿到的就是 SDK 解析后的同一份 JSON（用 `JSON.parse(JSON.stringify(chunk))` 把 zod 实例 plain 化）。这让学习者能直接对照 SDK 内部结构与 HTTP 上的 wire format。

## 文件结构

```
01-Streaming-SSE/
├── server.ts            ← 后端：koa + @koa/router + koa-static
│                            - GET / 静态页（§5.3 React 内联块）
│                            - GET /api/stream （模拟 SSE）
│                            - GET /api/blocking （一次性）
│                            - GET /api/real （真实 LLM）
├── public/
│   └── index.html       ← Tailwind + React 18 UMD + Babel Standalone + 内联 JSX
└── README.md
```