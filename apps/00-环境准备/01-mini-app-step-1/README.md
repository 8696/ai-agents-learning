# 00 环境准备 · Mini App（模块 00 代码落点）

模块 00 的 HTTP 入口（[AGENTS.md §5.1](../../../AGENTS.md#51-apps-子文件夹结构)）。已按 §5.3.8 拆成总览 + 两个场景页。没有 CLI。

| 入口 | 文件 | 协议 | 端口 |
| ---- | ---- | ---- | ---- |
| `yarn app:00-01-mini-app-step-1` | `server.ts` | A · HTTP + SSE | **50000** |

按条 Demo `01-API-Key-计费` 不 import 进本文件夹。取消 / 限流 / 协议对照在模块 02，不塞进本入口。

## 跑起来

```bash
cd apps
yarn install
cp .env.example .env   # 填当前 LLM_PROVIDER 对应的 Key
yarn app:00-01-mini-app-step-1
# → http://127.0.0.1:50000/                  总览（场景地图 + 环境自检）
# → http://127.0.0.1:50000/pages/chat.html   流式对话
# → http://127.0.0.1:50000/pages/frames.html 原始帧
```

## 数据流

```text
浏览器 POST /api/chat { message }
  → routes/chat.ts（闸门必须在开流之前）
  → lib/flow/stream-chat.ts（上游 stream:true，chunk 原样转发）
  → lib/sse/sse-writer.ts（data: {json}\\n\\n … data: [DONE]）
  → public/utils/sse-client.js 切帧
  → chat.html 拼 delta.content / frames.html 一帧一卡
```

## 当前能做什么

- HTTP：`GET /health` 填页脚 `#env-info`（provider / model / Key，禁止写死）
- 流式对话页：逐字上屏 + loading + 400（空消息）/ 网络错误
- 原始帧页：看见 `delta` / `finish_reason` / `usage` / `[DONE]`
- Key ❌ 时主按钮 disabled

## 文件结构

```
01-mini-app-step-1/
├── server.ts                 # HTTP 只装配
├── routes/  lib/{http,sse,flow}/
└── public/{index.html, pages/, components/, utils/}
```

只 import `apps/llm.ts` 与 `apps/load-root-env.ts`。

## 对应学习沉淀

- 模块 00：[docs/学习模块/00-环境准备/](../../../docs/学习模块/00-环境准备/)
- SSE 细节 → 模块 02 `01-Streaming-SSE`；协议对照 → `02-协议-A-vs-B`
