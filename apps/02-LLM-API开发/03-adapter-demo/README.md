# Demo · Adapter 层（协议 A vs B 统一调用 · §5.3）

对应：[模块 02 · 协议 A vs B](../../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md)

本条必须看见：业务代码只调 `sendMessage` / `sendMessageStream`，SDK 与字段翻译关在 `lib/protocol-a` / `lib/protocol-b`。

## 端口

**50213**（同小节第二份 HTTP Demo，小节位 +10）。脚本 `yarn app:02-03-adapter`。

## 浏览器访问

```bash
cd apps
yarn app:02-03-adapter
# → http://127.0.0.1:50213/                     总览
# → http://127.0.0.1:50213/pages/once.html      一次性 UnifiedResponse
# → http://127.0.0.1:50213/pages/stream.html    流式 UnifiedDelta
```

## 数据流

```text
业务（route / 页面）
  → lib/adapter/send-message.ts   # 仅按 protocol 分叉
  → lib/protocol-a/*  或  lib/protocol-b/*
  → UnifiedResponse / UnifiedDelta
```

## 文件结构

```
03-adapter-demo/
├── server.ts
├── routes/
├── lib/http/  lib/adapter/  lib/protocol-a/  lib/protocol-b/
└── public/{index.html, pages/, components/, utils/}
```

§5.3.13 对照例外：一份 Demo、两套协议分层，分叉只在 adapter 入口。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | provider / modelA / modelB / hasKey |
| POST | `/api/chat` | UnifiedResponse |
| POST | `/api/chat-stream` | SSE UnifiedDelta |

## 对应学习沉淀

[docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md](../../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md)
