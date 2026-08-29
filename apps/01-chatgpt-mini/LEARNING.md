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
| 3 | **两种协议、两个 SDK** | 协议 A：`openai` + `/v1`；协议 B：`@anthropic-ai/sdk` + `/anthropic`。MiniMax **同 Key**。模块 00 只验收 A | [`src/index.ts`](./src/index.ts#L41-L44)；[`src/index-anthropic.ts`](./src/index-anthropic.ts) |
| 4 | **中国区域名别写错** | 国内 `api.minimaxi.com`，不是 `api.minimax.io` | `apps/.env` + [`src/index.ts`](./src/index.ts#L29-L33) |
| 5 | **Zod 是运行时守门员** | TS 管编译期；`process.env` 用 Zod `parse` | [`src/index.ts`](./src/index.ts#L25-L37) |
| 6 | **messages 是对话的原子单位** | 现在只有 `user` 一条；以后加 `system`、`assistant` 就是多轮 | [`src/index.ts`](./src/index.ts#L57) |
| 7 | **Streaming 是产品标配** | `stream: true` + `for await` + `delta` | [`src/index.ts`](./src/index.ts#L55-L78) |
| 8 | **Token = 钱** | `prompt_tokens` + `completion_tokens` | [`src/index.ts`](./src/index.ts#L65-L66) · [`src/index.ts`](./src/index.ts#L82-L93) |

### 必须能手画的数据流（闭卷）

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

### 必须能答的 5 个问题

1. **为什么模块 00 只验收一家、一种协议？** → 先跑通「发消息 → 流式回复 → 看用量」。协议 B 入口可超前，对照留模块 02。
2. **为什么用 `resolve(..., "../..")` 而不是 `process.cwd()`？** → `yarn dev` 时 cwd 是子项目，`.env` 在 `apps/`，cwd 不可靠。
3. **`delta.content` 和完整 `message.content` 有什么区别？** → delta 是本 chunk **增量**；完整回复要自己拼接。
4. **流式和非流式差在哪？** → 非流式一次返回全文；流式边生成边推，TTFT 更短。
5. **如果 `MINIMAX_API_KEY` 写错，错误在哪一步暴露？** → Zod `parse`（空）或 SDK 请求（401/403）；应让 Zod 在启动期拦住「没配 Key」。

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
模块 02            协议 A↔B 对照 + 智谱 + Anthropic 官方；HTTP/SSE
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

```text
yarn dev / argv  →  apps/.env + Zod  →  OpenAI SDK（MiniMax /v1）
                                              ↓
stdout ← for await delta  ←  chat.completions stream  ←┘
```

## 关键文件

| 文件 | 职责 |
| ---- | ---- |
| `src/index.ts` | 协议 A：`openai` + `/v1` → `chat.completions` 流式（模块 00 验收） |
| `src/index-anthropic.ts` | 协议 B 对照入口：`@anthropic-ai/sdk` + `/anthropic`（模块 02 验收） |
| `src/load-root-env.ts` | 共用 dotenv 加载 `apps/.env`；新建 app 时复制此文件 |
| `apps/.env` | `MINIMAX_*` 运行时配置 |
| `apps/.env.example` | 变量模板与智谱预留 |
| `package.json` | 依赖；`engines.node` ≥22；`yarn dev` / `yarn dev:anthropic` / `yarn typecheck` |
| `tsconfig.json` | `extends` `apps/tsconfig.base.json` |

## 回填记录

| 模块 | 加了什么 |
| ---- | -------- |
| 00 | 项目初始化；协议 A 验收入口；协议 B 对照入口（超前，02 再验收）；`apps/.env` 约定 |
