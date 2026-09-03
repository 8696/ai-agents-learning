# Demo · 协议 A vs B（对照例外 · 一份 Demo 两套协议）

对应：[模块 02 · LLM API 开发](../../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md)

§5.3 全栈版 · §5.3.8 按职责分层 · §5.3.13 **对照例外**：`lib/protocol-a` 只有 openai，`lib/protocol-b` 只有 `@anthropic-ai/sdk`，并排形状在 `lib/compare`。分叉只在 route 层两个文件，禁止同一个函数 `if (protocol==="b")` 调两家 SDK。

## 端口

**50202**。可临时 `PORT=50999 yarn app:02-02-protocol-ab` 覆盖。脚本名不变。

## 浏览器访问

```bash
cd apps
yarn app:02-02-protocol-ab
# → http://127.0.0.1:50202/                      总览（字段映射 ASCII + 导航）
# → http://127.0.0.1:50202/pages/once.html       一次性：/api/compare + /api/think-compare
# → http://127.0.0.1:50202/pages/stream-a.html   流式 A：/api/a-stream-raw（可兼 /api/a）
# → http://127.0.0.1:50202/pages/stream-b.html   流式 B 有/无 thinking
```

yarn 入口只有这一条。没 Key 时服务仍能起；页脚 `Key ❌`，场景页主按钮 disabled。

## 数据流

```text
场景页
  → POST /api/compare | /api/think-compare | /api/a-stream-raw | /api/b-thinking-stream | /api/b-stream-raw
  → routes/（A 文件只调 protocol-a，B 文件只调 protocol-b；对照 route 分别调用两个函数）
  → lib/protocol-a/*  或  lib/protocol-b/*
  → lib/compare 只整形（同一 prompt、并排 { a, b } / 四张 ThinkScenario）
```

## 文件结构

```
02-协议-A-vs-B/
├── server.ts                 # 只装配
├── routes/                   # health / a / a-stream-raw / b / b-thinking-stream / b-stream-raw / compare / think-compare
├── lib/
│   ├── http/                 # runtime-ctx / request-guards / sse-writer / write-upstream-error
│   ├── protocol-a/           # 只用 openai
│   ├── protocol-b/           # 只用 @anthropic-ai/sdk
│   └── compare/              # 协议无关：同一 prompt、并排结果形状
├── README.md
└── public/{index.html, pages/, components/, utils/}
```

只 import `apps/llm.ts`（`getLlmOptional`）。不 import 其它小节。

## 接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/health` | `ok, port, provider, model, modelB, hasKey` |
| POST | `/api/a` | 协议 A 流式，OpenAI chunk 原样 SSE（curl） |
| POST | `/api/b` | 协议 B 流式，text 增量 + 末帧 usage（curl） |
| POST | `/api/compare` | 一次性两侧完整 JSON |
| POST | `/api/think-compare` | 4 组：A 关 / A 开 / B 关 / B 开 budget=500 |
| POST | `/api/a-stream-raw` | 协议 A 流式 + `kind`（role/chunk/finish/usage） |
| POST | `/api/b-thinking-stream` | 协议 B 流式 + 启用 thinking（完整事件流） |
| POST | `/api/b-stream-raw` | 协议 B 流式、不启用 thinking |

请求体：`{ "message": "...", "system": "...", "enable_thinking": false, "thinking_budget": 500 }`。

## §5.3.2 六项

各场景页各自齐：happy path、错误 ≥2 类（空 message 400 + 网络 fetch reject）、loading（`#status-pill` + 按钮 disabled）、`#output`、页脚 `#env-info`（provider / modelA / modelB 由 `GET /health` 填）、`#page-intro`。总览页 happy path = 读到 health。无 Key 时主按钮直接 disabled。

## 入口脚本

`app:02-02-protocol-ab` → `tsx 02-LLM-API开发/02-协议-A-vs-B/server.ts`

## 概念

[docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md](../../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md)
