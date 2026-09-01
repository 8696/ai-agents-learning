# 01 ChatGPT Mini · 代码怎么跑

> **本文件是这个项目的当前地图**（回填：**当前段改写**数据流和行号，`### 模块 XX` **只追加**）。概念、取舍、踩坑写在 [docs/学习模块/](../../docs/学习模块/README.md) 对应**小节 MD**（例如 [模块 00 本地产出](../../docs/学习模块/00-环境准备/04-本地产出.md)），不要把教材写在这里。别人怎么跑 → 同目录 [README.md](./README.md)（回填时改成当前真相，不堆历史验收）。细则 [AGENTS.md §5.1](../../AGENTS.md#51-项目只有-readme-与-learning)。

- 对应文档模块：00（环境准备）；后续 02、03、04、06 等回填进本项目
- 本仓库路径：apps/01-chatgpt-mini
- 入口文件：`src/index.ts`（协议 A）· `src/index-anthropic.ts`（协议 B 对照入口，模块 02 才验收）· `src/load-root-env.ts`（共用加载 .env）

---

## 重点

> **复习时先看本节**。下面几条必须能脱稿讲清楚。

| # | 重点 | 一句话记住 | 代码锚点 |
| - | ---- | ---------- | -------- |
| 1 | **密钥不进仓库** | `.env` 本地用，`.env.example` 只给模板 | `apps/.env` + [`src/index.ts`](./src/index.ts#L25-L37) |
| 2 | **配置在 apps/、代码在子项目** | 用 `import.meta.url` 反推 `apps/`，不靠 cwd | [`src/load-root-env.ts`](./src/load-root-env.ts#L10-L21)；[`src/index.ts`](./src/index.ts#L21) |
| 3 | **三种入口、两个协议** | CLI-A：`openai` + `/v1`；CLI-B：`@anthropic-ai/sdk` + `/anthropic`；HTTP-A：`openai` + `/v1` 起 SSE + 浏览器聊天页。MiniMax **同 Key** | [`src/index.ts`](./src/index.ts#L41-L44)；[`src/index-anthropic.ts`](./src/index-anthropic.ts)；[`src/server.ts`](./src/server.ts)；[`public/index.html`](./public/index.html) |
| 4 | **中国区域名别写错** | 国内 `api.minimaxi.com`，不是 `api.minimax.io` | `apps/.env` + [`src/index.ts`](./src/index.ts#L29-L33) |
| 5 | **Zod 是运行时守门员** | TS 管编译期；`process.env` 用 Zod `parse`；POST body 也走 Zod | [`src/index.ts`](./src/index.ts#L25-L37)；[`src/server.ts`](./src/server.ts) |
| 6 | **messages 是对话的原子单位** | 现在只有 `user` 一条；以后加 `system`、`assistant` 就是多轮 | [`src/index.ts`](./src/index.ts#L57)；[`src/server.ts`](./src/server.ts) |
| 7 | **Streaming 是产品标配** | CLI：`stream: true` + `for await` + `delta`；HTTP：`res.write('data: ...\n\n')` 逐帧转发 | [`src/index.ts`](./src/index.ts#L55-L78)；[`src/server.ts`](./src/server.ts) |
| 8 | **Token = 钱** | `prompt_tokens` + `completion_tokens`；流式时只在**最后一帧**报 | [`src/index.ts`](./src/index.ts#L65-L66) · [`src/index.ts`](./src/index.ts#L82-L93) |
| 9 | **SSE 帧 = `data: {json}\n\n`** | `\n\n` 是帧分隔；`data: [DONE]` 是结束帧；body 必须先 buffer 再 parse | [`src/server.ts`](./src/server.ts) |
| 10 | **OpenAI SDK chunk 是 zod 类实例** | 直接 `JSON.stringify(chunk)` 会得 `{}`；要 `JSON.parse(JSON.stringify(...))` 才能原样转发 | [`src/server.ts`](./src/server.ts) |

### 必须能手画的数据流（闭卷）

CLI（协议 A）：

```text
yarn dev "你好"
  → process.argv 得到 userMessage
  → dotenv 读 apps/.env
  → Zod 校验 MINIMAX_*
  → new OpenAI({ apiKey, baseURL })   // baseURL 指向 MiniMax
  → POST .../chat/completions { messages, stream: true }
  → 服务端逐 chunk 推送
  → for await: 取 choices[0].delta.content → stdout（不换行）
  → 流结束: usage 或提示去控制台
```

HTTP + SSE（协议 A）：

```text
yarn dev:server
  → http.createServer 监听 127.0.0.1:3000
  → POST /api/chat: 读 body → Zod 校验 → OpenAI SDK stream:true
  → for await chunk → JSON.parse(JSON.stringify(chunk)) 把 zod 实例 plain 化
  → res.write(`data: ${JSON.stringify(plain)}\n\n`)  ← SSE 帧
  → 结束帧 res.write("data: [DONE]\n\n") → res.end()
```

### 必须能答的 5 个问题

1. **为什么模块 00 只验收一家、一种协议？** → 先跑通「发消息 → 流式回复 → 看用量」。协议 B 入口可超前，对照留模块 02。
2. **为什么用 `resolve(..., "../..")` 而不是 `process.cwd()`？** → `yarn dev` 时 cwd 是子项目，`.env` 在 `apps/`，cwd 不可靠。
3. **`delta.content` 和完整 `message.content` 有什么区别？** → delta 是本 chunk **增量**；完整回复要自己拼接。
4. **流式和非流式差在哪？** → 非流式一次返回全文；流式边生成边推，TTFT 更短。
5. **SSE 一帧长什么样？怎么判结束？** → `Content-Type: text/event-stream`，每帧 `data: {json}\n\n`，遇 `data: [DONE]\n\n` 退出循环。
6. **为什么不能 `JSON.stringify(chunk)` 直接转发？** → OpenAI SDK v4 的 chunk 是 zod 类实例（`ChatCompletionChunk`），属性不通过 enumerable 暴露；必须 `JSON.parse(JSON.stringify(chunk))` 彻底 plain 化再 stringify。

### 本模块最容易踩的 3 个坑

| 坑 | 现象 | 正确做法 |
| -- | ---- | -------- |
| Key 进 git | 推送后额度被刷 | 只提交 `apps/.env.example`；Key 只在 `apps/.env` |
| 海外站 URL | 请求失败或连错环境 | 国内默认 `https://api.minimaxi.com/v1` |
| Token Plan Key 当 API Key | 鉴权失败 | 按量计费用「接口密钥」；订阅套餐用「订阅 Key」，二者不互换 |

### 与后续模块的衔接

```text
模块 00（本课）     调 API、流式、env、Zod 守门
      ↓
模块 01            Token、Context Window（笔记，不改本项目）
      ↓
模块 02            Streaming/SSE 已回填（HTTP + SSE 服务端） → 协议 A↔B 对照 + AbortController 已回填 + 429
      ↓
模块 03–04         system prompt + Zod 约束模型 JSON
      ↓
模块 06            messages 数组变长 = 多轮对话
```

---

## 本模块知识点

> 回填时更新顶部锚点，并把新能力**各用几条**追加到 `### 模块 XX`。详细概念见对应小节 MD。

### 模块 00 · 环境准备

- 密钥：`apps/.env`；`envSchema.parse(process.env)` 启动期拦住空 Key / 非法 URL
- 路径：`load-root-env.ts` 用 `import.meta.url` 找到 `apps/`，不靠 `process.cwd()`
- 协议 A（验收）：`openai` + `api.minimaxi.com/v1` → `chat.completions.create({ stream: true })`
- 协议 B（对照入口，不算 00 验收）：`yarn dev:anthropic` → `index-anthropic.ts`
- 流式：`delta.content` 是增量；用 `stdout.write` 不要 `console.log`
- Token：优先打流里的 `usage`，没有则去 [控制台](https://platform.minimaxi.com/user-center/payment/balance)

概念全文 → [模块 00 学习沉淀](../../docs/学习模块/00-环境准备/04-本地产出.md)

### 模块 02 · LLM API 开发（进行中，外部条按条回填）

- **模块 02 · Streaming/SSE（已落）**：新增 [`src/server.ts`](./src/server.ts)
  - `POST /api/chat` → 协议 A 流式 → SSE 帧（`data: {json}\n\n`，结束帧 `data: [DONE]\n\n`）
  - 入口：`yarn dev:server`（端口默认 3000，可通过 `PORT` 改）
  - Zod 校验 `MINIMAX_*` 与请求体 `message`；CORS 预检 + 跨域响应头
  - `JSON.parse(JSON.stringify(chunk))` 把 OpenAI SDK 的 zod 类实例 plain 化再转发
  - 概念/取舍/踩坑见 [Streaming / SSE 小节 MD](../../docs/学习模块/02-LLM-API开发/01-Streaming-SSE.md)
- **模块 02 · 02-协议-A-vs-B（已落）**：项目协议 B 入口 [`src/index-anthropic.ts`](./src/index-anthropic.ts) 在模块 00 已超前放置；模块 02 本地拆步第 5 步「跑 yarn dev:anthropic 对照协议 A vs B（入口若已在则不必新装 SDK）」—— **这一刀已落在模块 00**；双协议字段对照、role 位置、usage 字段名映射等见 [02-协议-A-vs-B 小节 MD](../../docs/学习模块/02-LLM-API开发/02-协议-A-vs-B.md)
- **模块 02 · 03-AbortController（已落）**：CLI 协议 A [`src/index.ts`](./src/index.ts) + CLI 协议 B [`src/index-anthropic.ts`](./src/index-anthropic.ts) + HTTP [`src/server.ts`](./src/server.ts) 三处各自在「首个文本块到时」（协议 A = 第一个 for await chunk；协议 B = 第一个 `stream.on('text')` 事件；HTTP = 第一个 res.write）启 `setTimeout(3000)` → `controller.abort()`，模拟"用户读了会儿中途取消"；`signal` 作为 SDK 的第二个 options 参数传入（`chat.completions.create` / `messages.stream` / `messages.create` 三处都接受）；catch `AbortError` / `APIUserAbortError` 时 HTTP 端发 `{event:"aborted", reason:"simulated-user-cancel-3s"}` 帧 + `res.end()`（非错误结束），CLI 端打印「已中止」并 `exit 0`；详见 [03-AbortController 小节 MD](../../docs/学习模块/02-LLM-API开发/03-AbortController.md)
- **模块 02 · 04-Rate-Limit（待学）**：429 / 超时 / 网络错误三分支（可重试 vs 不可重试）

---

## 运行时数据流

1. **启动**：`yarn dev [可选消息]` → `tsx src/index.ts`，参数进 `process.argv`。
2. **读配置**：`loadRootEnv()` 加载 `apps/.env`。
3. **校验**：`envSchema.parse(process.env)`；失败则退出并打印 Zod 中文错误。
4. **建客户端**：`new OpenAI({ apiKey, baseURL })`，请求走 MiniMax 国内 endpoint。
5. **拼消息**：CLI 或默认句 → `messages: [{ role: "user", content }]`。
6. **发请求**：`chat.completions.create({ stream: true, stream_options: { include_usage: true } })`。
7. **收流**：`for await`；每个 `delta.content` 写入 stdout。
8. **收尾**：换行；有 `usage` 则打印，否则提示去控制台。
9. **错误**：`main().catch` → `process.exit(1)`。

HTTP + SSE（`yarn dev:server` → `tsx src/server.ts`）：

1. **起服务**：`createServer` 监听 `127.0.0.1:$PORT`（默认 3000）。
2. **读配置**：与 CLI 同源（`loadRootEnv` + 同一 Zod 校验）。
3. **路由**：CORS 预检 → `GET /` 返回浏览器聊天页 → `GET /health` 健康检查 → `POST /api/chat` 流式聊天。
4. **收 body**：累加 Buffer → `JSON.parse` → Zod `bodySchema.parse`（失败 → 400）。
5. **建客户端**：与 CLI 同一 `new OpenAI`。
6. **发请求**：同样 `stream: true` + `include_usage: true`。
7. **转发**：`for await` chunk → `JSON.parse(JSON.stringify(chunk))` 去 zod 外壳 → `res.write("data: ...\n\n")`。
8. **结束**：写 `data: [DONE]\n\n` → `res.end()`；中途出错 → 写一帧 `{error}` 再 `res.end()`。

浏览器聊天页（`public/index.html`，直接 GET / 拿到）：

1. `fetch('/api/chat', POST)` 拿 SSE 流。
2. `res.body.getReader()` 逐 chunk 读。
3. 用 `TextDecoder` decode + **buffer 累加**（TCP 可能把一帧切成多个 chunk）。
4. 按 `\n\n` 切帧（**SSE 帧分隔**）；每帧取 `data:` 行的 JSON。
5. `JSON.parse` → 取 `choices[0].delta.content` → 累加到 DOM（**逐字渲染**）。
6. 遇 `data: [DONE]` / `done: true` 退出循环；显示 `usage`（仅最后一帧出现）。

```text
yarn dev / argv  →  apps/.env + Zod  →  OpenAI SDK（MiniMax /v1）
                                              ↓
stdout ← for await delta  ←  chat.completions stream  ←┘

yarn dev:server  →  createServer(:3000)  →  POST /api/chat
                                                  ↓
            res.write('data: ...\n\n')  ←  OpenAI SDK stream  ←  apps/.env + Zod
                                                  ↓
                                            res.end() / data: [DONE]
```

## 关键文件

| 文件 | 职责 |
| ---- | ---- |
| `src/index.ts` | 协议 A：`openai` + `/v1` → `chat.completions` 流式（CLI，模块 00 验收） |
| `src/index-anthropic.ts` | 协议 B 对照入口：`@anthropic-ai/sdk` + `/anthropic`（CLI；模块 02 协议 A vs B 那条验收）+ 首个 `text` 事件后 3 秒自动 abort（模块 02 03-AbortController） |
| `src/server.ts` | HTTP + SSE 服务端：GET / 返回浏览器聊天页；GET /health 健康检查；POST /api/chat → 协议 A 流式转发为 SSE + **第一个 chunk 后 3 秒自动 abort**（模块 02 Streaming/SSE + 03-AbortController 那两条） |
| `public/index.html` | 浏览器聊天 UI：fetch + getReader + 按 `\n\n` 切帧 + 累加 `delta.content`（最小 SSE 客户端；逐字渲染 + 显示 usage） |
| `src/load-root-env.ts` | 共用 dotenv 加载 `apps/.env`；新建 app 时复制此文件 |
| `apps/.env` | `MINIMAX_*` 运行时配置 |
| `apps/.env.example` | 变量模板与智谱预留 |
| `package.json` | 依赖；`engines.node` ≥22；`yarn dev` / `yarn dev:anthropic` / `yarn dev:server` / `yarn typecheck` |
| `tsconfig.json` | `extends` `apps/tsconfig.base.json` |

## 回填记录

| 模块 | 加了什么 |
| ---- | -------- |
| 00 | 项目初始化；协议 A 验收入口；协议 B 对照入口（超前，02 再验收）；`apps/.env` 约定 |
| 02 | 模块 02 / Streaming-SSE：新增 [`src/server.ts`](./src/server.ts)（HTTP + SSE；CLI 保留） · 模块 02 / 03-AbortController：[`src/index.ts`](./src/index.ts)、[`src/index-anthropic.ts`](./src/index-anthropic.ts) 与 [`src/server.ts`](./src/server.ts) 各自在「首个文本块到时」`setTimeout(3000)` 自动 `controller.abort()`；signal 作为 SDK options 第二参 |
