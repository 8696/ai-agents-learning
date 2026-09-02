# 00 环境准备 · Mini App（模块 00 本地产出 Demo APP）

把模块 00 **已经落下的代码**整合成这一份最小产品（[AGENTS.md §5.4](../../../AGENTS.md#54-模块小-app本地产出行)）：

- **CLI · 协议 A**（`openai` + `/v1`）：一行命令发起流式对话，打印到控制台
- **CLI · 协议 B**（`@anthropic-ai/sdk` + `/anthropic`）：同上，但走 Anthropic Messages API
- **HTTP + SSE**（`openai` + `/v1`）：浏览器聊天页 + `POST /api/chat` 流式端点（默认端口 `50000`）

按条 Demo `01-API-Key-计费` 仍单独验证输入/输出 Token 分开；**不** import 进本文件夹。模块 02 的取消 / 429 / 协议对照 **不**塞进本入口。

- **CLI · 协议 A**（`openai` + `/v1`）：一行命令发起流式对话，打印到控制台
- **CLI · 协议 B**（`@anthropic-ai/sdk` + `/anthropic`）：同上，但走 Anthropic Messages API
- **HTTP + SSE**（`openai` + `/v1`）：浏览器聊天页 + `POST /api/chat` 流式端点

> 这一份**只承载模块 00 的最小闭环**。模块 02 / 03 / 04 的进阶能力（Streaming/SSE 对照演示、AbortController 演示、Rate-Limit 重试）落在 `apps/02-LLM-API开发/0X-XX/` 各自小节里，**不**塞进本入口。

## 跑起来

```bash
cd apps
yarn install
cp .env.example .env
# 编辑 apps/.env：填 MINIMAX_API_KEY
yarn app:00-01-mini-cli-a          # CLI 协议 A
yarn app:00-01-mini-cli-b          # CLI 协议 B
yarn app:00-01-mini-server         # HTTP + SSE（默认 127.0.0.1:50000）
```

Node ≥ 22（`apps/.nvmrc` 推荐 22；更高版本也可以）。

## 三个入口

| 入口 | 文件 | 类型 | 协议 | SDK | 端点 |
| ---- | ---- | ---- | ---- | --- | ---- |
| `app:00-01-mini-cli-a` | `src/index.ts` | CLI 流式 | A · OpenAI Chat Completions | `openai` | `api.minimaxi.com/v1` |
| `app:00-01-mini-cli-b` | `src/index-anthropic.ts` | CLI 流式 | B · Anthropic Messages API | `@anthropic-ai/sdk` | `api.minimaxi.com/anthropic` |
| `app:00-01-mini-server` | `server.ts` | HTTP + SSE（§5.3 React + koa） | A · OpenAI Chat Completions | `openai` | `api.minimaxi.com/v1` |

自定义问题：

```bash
yarn app:00-01-mini-cli-a 什么是 Agent？
yarn app:00-01-mini-cli-b 什么是 Agent？

# 浏览器聊天（推荐）：打开 http://127.0.0.1:50000/
yarn app:00-01-mini-server

# 或 curl 试 SSE 帧
curl -N -X POST http://127.0.0.1:50000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"什么是 Agent？"}'
```

## 环境变量

**模型 Key 在 `apps/.env`**（整份 `apps/` 共享一份，不重复）。详见 `apps/.env.example`。

| 变量 | CLI 协议 A | CLI 协议 B | HTTP 服务端 |
| ---- | ---------- | ---------- | ----------- |
| `MINIMAX_API_KEY` | ✅ 必填 | ✅ 必填（同一把 Key） | ✅ 必填 |
| `MINIMAX_BASE_URL` / `MINIMAX_MODEL` | ✅ | — | ✅ |
| `MINIMAX_ANTHROPIC_BASE_URL` / `MINIMAX_ANTHROPIC_MODEL` | — | ✅（有默认值） | — |
| `PORT`（HTTP 服务端） | — | — | 默认 `50000` |

## 当前能做什么

- CLI 协议 A 流式回复成功（控制台看到 token 用量）
- CLI 协议 B 流式回复成功（同一 Key 走 `/anthropic`）
- HTTP + SSE：浏览器打开 `http://127.0.0.1:50000/` 直接聊天；`POST /api/chat` 返回 SSE 流；`GET /health` 返回当前模型与端点
- `apps/.env` 不进 git

## 数据流（最小闭环）

CLI（协议 A）：

```text
yarn app:00-01-mini-cli-a "你好"
  → process.argv 得到 userMessage
  → apps/.env → Zod 校验 MINIMAX_*
  → new OpenAI({ apiKey, baseURL })
  → POST .../chat/completions { messages, stream: true }
  → for await delta.content → stdout
  → 流结束: usage 打印或提示去控制台
```

HTTP + SSE（协议 A）：

```text
yarn app:00-01-mini-server
  → koa 监听 127.0.0.1:50000
  → GET /         → public/index.html（Tailwind + React UMD + Babel Standalone）
  → GET /health   → { ok, model, port }
  → POST /api/chat → bodyParser → OpenAI SDK stream:true
                  → ctx.respond = false → ctx.res.write(`data: …\n\n`)
                  → 结束帧 data: [DONE]\n\n
```

## 对应学习沉淀

- 模块 00：环境配置、Key 安全、Node 版本 → `docs/学习模块/00-环境准备/`
- 协议 A vs B 的细节差异 → `docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md`
- HTTP + SSE 的帧结构与协议 → `docs/学习模块/02-LLM-API开发/01-Streaming-SSE.md`
- 取消 / 重试等进阶能力 → `apps/02-LLM-API开发/03-AbortController/`、`04-Rate-Limit/`
