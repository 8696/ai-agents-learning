# **AbortController**：取消后客户端停写、服务端可能仍在生成

> 对应模块：[模块 02 · LLM API 开发 ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 3 条

- **来源**：本对话（§6.2 完整讲解 + 用户追问"是否看模型提供商" + 厂商行为对照 + demo `demos/02-LLM-API开发/03-AbortController/` 实证 + 项目回填 `apps/01-chatgpt-mini/src/{index.ts, server.ts}`）
- **状态**：已沉淀
- **Demo**：已落 [demos/02-LLM-API开发/03-AbortController/](../../../demos/02-LLM-API开发/03-AbortController/)（3 端点对照：流到底基线 / 收 N 帧就停 / 故意不传 signal；浏览器页面 + 后端日志）
- **回填**：已增量 `apps/01-chatgpt-mini`（[src/index.ts](../../../apps/01-chatgpt-mini/src/index.ts) CLI 接 SIGINT + [src/server.ts](../../../apps/01-chatgpt-mini/src/server.ts) HTTP 接 `req.on('close')`）

> 各节写什么、怎么判断归哪一节、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

## 是什么

`AbortController` 是浏览器 / Node 里的「取消信号发射器」。两部分：

```ts
const controller = new AbortController(); // 发射器
const signal = controller.signal;          // 信号，挂到异步操作上

setTimeout(() => controller.abort(), 500); // 触发取消

try {
  const res = await fetch(url, { signal });
} catch (err) {
  if (err.name === 'AbortError') console.log('请求被取消了');
}
```

`abort()` 同时干三件事：
1. `signal.aborted` 变 `true`
2. 触发 `signal.onabort` 回调
3. **对 fetch**：立刻 reject 一个 `AbortError` + 关底层 socket；**对 OpenAI / Anthropic SDK**：把 signal 传给底层 fetch，效果同上；**SDK 自己再抛 `APIUserAbortError`** 包一层

Node SDK 接 AbortController = **SDK 自己不实现取消**，就是把 signal 转给底层 HTTP 客户端。

## 为什么（Agent 开发要懂）

1. **客户端按 Ctrl-C / 关页面 / 切到别的对话**：用户不想看了，但**服务端还在烧算力**。如果 fetch 没带 signal，那个 socket 一直挂着，模型继续生成 token，**钱照算**。
2. **新问题来了**：旧请求没必要继续推了。
3. **客户端超时**：前端 fetch 30 秒没动静，主动 abort + 提示「网络慢」。

**生活例子**——**点外卖**：你下单 5 分钟后不饿了，按取消 = 给骑手打电话「不用送了」。但**厨房里那盘菜已经在做了**——骑手要不要回去跟厨房说「这单取消」？要。这个「打电话」就是 abort；「厨房停不停止」是另一回事（**服务端**的事）。已切好的葱花不会退。

## 易混点

### 1. 客户端 abort ≠ 服务端停止生成（最重要）

链路：

```
客户端 fetch ──── signal ────→ Node SDK ───→ HTTP 请求 ───→ 服务端（生成 token）
   │                              │                              │
   │ abort() 触发                  │ 关 socket                    │
   ├──── 客户端停写 ◀──────────────┘                              │
   │ │
   └────────── 服务端继续生成直到自然结束 ─────────────────────────┘
                                            │
                                            ▼
 已生成的 token 已算费用
                                  结果没人接 = 浪费
```

**只有两种方式能让服务端真正停**：
- (a) **关掉底层 socket**（fetch abort 通常能做到——TCP RST/FIN 让对端 HTTP 库知道断连，主流实现会停读）。但**有的实现是 graceful close（FIN 而非 RST）**，服务端写完所有缓存才返回——「关网络 ≠ 立刻停生成」的灰区。
- (b) **服务端原生 cancel API**（Anthropic 有 `client.messages.cancel()`，看版本；OpenAI 公开 API 没有，国产厂商看实现）。

**严格说**：客户端 abort = 「告诉服务端我不想接了」，**不能保证模型立刻停**。**生成过的 token，费用按生成的算**。

### 2. 是否看模型提供商？——分两层

**第一层：客户端 abort（关 fetch / 关 socket）**——**所有厂商都支持**，这是 HTTP 协议层面的事，跟模型是谁没关系。

**第二层：abort 后服务端能不能立刻停生成**——**看厂商**，但**所有厂商已生成的 token 都照算钱**（行业共识）。

| 厂商 | 关 socket 后服务端行为 | 服务端原生 cancel API |
|---|---|---|
| **OpenAI** | 关 socket 后服务端通常停继续生成（但**已生成的 token 算钱**） | 公开 API **没有**；只能靠断连 |
| **Anthropic** | 同上 | 有 `client.messages.cancel()`（看 SDK 版本） |
| **MiniMax / 智谱 / DeepSeek** | 同上——关 socket 后多数场景停 | 看具体实现，公开 API 大多没有 |
| **自部署（vLLM / TGI / Ollama）** | **不一定**——很多框架关 socket 后**模型继续跑到结束**才罢手，最费钱 | 看框架实现，有的支持 `abort` endpoint |

**最坏情况**：自部署 + 关 socket 后服务端继续生成——你已经不读响应了，**钱继续扣**，等到模型自然结束才停。这是生产里最常见的「为啥 token 用量对不上」的来源之一。

### 3. `AbortController` vs `EventSource`

| | AbortController | EventSource |
|---|---|---|
| 适用方法 | 任意（GET / POST / 流式） | **只能 GET** |
| 取消 | `controller.abort()` | `eventSource.close()` |
| 鉴权 Header | 任意 | 受限（不能自定义，需 query token） |

LLM 调用**几乎都用 AbortController + fetch + getReader**——因为要 POST、要带 `Authorization` Header。

### 4. `signal: passed` vs `not passed`

- **not passed**：fetch 不接受取消信号，**请求跑到底**，你只能 `res.body.cancel()` 关流——但底层 socket 仍挂着。
- **passed**：fetch 一收到 abort 立刻 reject AbortError + 关底层 socket。

**踩坑**：你 `controller.abort()` 但请求没断——大概率是 signal 没传。

### 5. `AbortSignal.timeout(ms)`（Node 17+）

Node 17+ 提供「超时即 abort」糖：

```ts
const signal = AbortSignal.timeout(3000); // 3 秒后自动 abort
const res = await fetch(url, { signal });
```

不要手写 `setTimeout` + `controller.abort()`。**注意**：是从**创建 signal 时**开始计时，不是从第一个 chunk 起。长 prompt + 慢模型 30 秒很正常——别拍脑袋。

### 6. SDK 层 vs fetch 层

OpenAI / Anthropic SDK 接 AbortController 做两步：
- 把 `signal` 传给底层 fetch / HTTP 客户端（**真正关 socket**）
- SDK 自己再抛 `APIUserAbortError` 让你能 catch

**catch 要双写**：`err.name === 'AbortError'`（Node fetch）vs `err.constructor?.name === 'APIUserAbortError'`（SDK 包过）。本项目 `apps/01-chatgpt-mini/src/{index.ts, server.ts}` 同时判这两种。

## 例子

### 例子 1：CLI — 收到第一个 chunk 后 3 秒自动 abort（已回填到 `src/index.ts`）

```ts
const controller = new AbortController();
let abortTimer: NodeJS.Timeout | null = null;
let firstChunkAt: number | null = null;

const stream = await client.chat.completions.create(
  {
    model: 'MiniMax-M3',
    messages: [{ role: 'user', content: '写一首长诗' }],
    stream: true,
    stream_options: { include_usage: true },
  },
  { signal: controller.signal },  // ← signal 在第二个参数
);

for await (const chunk of stream) {
  // 第一个 chunk 到 → 启 3 秒定时器（模拟用户读了会儿中途取消）
  if (firstChunkAt === null) {
    firstChunkAt = Date.now();
    abortTimer = setTimeout(() => {
      console.log('[3 秒到 → 模拟用户中途取消] controller.abort()');
      controller.abort();
    }, 3000);
  }

  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
  if (chunk.usage) usage = chunk.usage;
}

// 流跑完则清掉定时器
if (abortTimer) clearTimeout(abortTimer);

main().catch((error: unknown) => {
  if (error instanceof Error && (error.name === 'AbortError'
    || error.constructor.name === 'APIUserAbortError')) {
    console.log('[已中止] 之前已生成的 token 仍会计费');
    process.exit(0);
  }
  process.exit(1);
});
```

### 例子 2：HTTP 服务端 — 收到第一个 chunk 后 3 秒自动 abort（已回填到 `src/server.ts`）

```ts
const controller = new AbortController();
let abortTimer: NodeJS.Timeout | null = null;
let firstChunkAt: number | null = null;

res.writeHead(200, { 'Content-Type': 'text/event-stream', ... });

try {
  const stream = await client.chat.completions.create(
    { ..., stream: true },
    { signal: controller.signal },
  );

  for await (const chunk of stream) {
    if (firstChunkAt === null) {
      firstChunkAt = Date.now();
      abortTimer = setTimeout(() => controller.abort(), 3000);
    }

    try {
      res.write(`data: ${JSON.stringify(JSON.parse(JSON.stringify(chunk)))}\n\n`);
    } catch (writeErr) {
      break; // res 已 destroy
    }
  }
  if (abortTimer) clearTimeout(abortTimer);
  res.write('data: [DONE]\n\n');
  res.end();
} catch (err) {
  if (err instanceof Error && (err.name === 'AbortError'
    || err.constructor.name === 'APIUserAbortError')) {
    if (abortTimer) clearTimeout(abortTimer);
    res.write(`data: ${JSON.stringify({
      event: 'aborted',
      reason: 'simulated-user-cancel-3s',
    })}\n\n`);
    res.end();
    return;
  }
  res.write(`data: ${JSON.stringify({error: err.message})}\n\n`);
  res.end();
}
```

**为什么不监听 `process.on('SIGINT')` / `req.on('close')`？**——本项目的回填**只**模拟"用户读了会儿中途取消"这一个场景，所以用 **3 秒自动定时**就够。生产里这两个监听**也常用**（CLI 用户按 Ctrl-C / 浏览器关页面），只是被本模块的回填缩到一个最小表达。

### 例子 3：浏览器关页面时取消流

```ts
const controller = new AbortController();

fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ message }),
  signal: controller.signal,
});

// 浏览器关页面 / 切到别的 tab
window.addEventListener('pagehide', () => controller.abort());
```

### 例子 4：超时自动 abort

```ts
const signal = AbortSignal.timeout(60_000); // 60 秒
const stream = await client.chat.completions.create({ ..., stream: true }, { signal });

for await (const chunk of stream) {
  // 60 秒内还没结束 → 下一帧 / 流结束时 AbortError
}
```

### 例子 5：Demo 三端点对照实证（[demos/02-LLM-API开发/03-AbortController/](../../../demos/02-LLM-API开发/03-AbortController/)）

浏览器页面三个按钮：

| 按钮 | 端点 | 看 | 结论 |
|---|---|---|---|
| ① 流到底 | `POST /api/full` | 帧数 47、usage 117 tokens、✅ | 基线 |
| ② 收 5 帧就停 | `POST /api/cancel-after-frames` | 帧数 5、🛑 aborted、usage 未拿到 | 客户端停了 → 服务端真的停了 |
| ③ 故意不传 signal | `POST /api/no-signal-abort` | 帧数 47、usage 117 tokens | **signal 没传 = abort 完全无效**，钱照扣 |

**对照结论**：
- ① vs ②：cancel 帧数 < full 帧数 → OpenAI 流式关 socket 后停了继续扣费
- ② vs ③：传 signal 能省 token + 能中止；不传 signal 服务端继续跑 = 钱继续扣

## 我追问过的

- **追问：是不是要看模型提供商是否支持 Abort？** → 答：**分两层**。
  - 客户端 abort（关 fetch / 关 socket）**所有厂商都支持**——HTTP 协议层面。
  - abort 后服务端能不能**立刻停生成**——**看厂商**，但**所有厂商已生成的 token 都照算钱**。
  - 详见 [§易混 2](#2-是否看模型提供商分两层)。自部署（vLLM / TGI / Ollama）是最坏情况——关 socket 后模型继续跑到自然结束才停。

## 取舍

- **手动 cancel vs `AbortSignal.timeout`**：流式 LLM 响应通常**不要拍脑袋设超时**——长文章、长 reasoning 可能正常就要超过 30 秒。**给用户主动 cancel 按钮 + Ctrl-C** 比「30 秒就断」体验好。
- **服务端原生 cancel vs 客户端断连**：理想是 `client.messages.cancel()` 立刻停模型；现实是多数场景靠**关 socket 让服务端写错误**。从成本控制角度——**关 socket 已经能让多数主流厂商停止继续扣费**（看厂商实现；自部署例外）。

## 踩坑

1. **`signal` 没传给 SDK**：你 `controller.abort()` 但请求没断。OpenAI / Anthropic SDK 的 `create()` 接受 `signal` 作为第二个 options 参数，**必须传**。本项目 `src/{index.ts, server.ts}` 已传。
2. **服务端还在写**：「我 abort 了为啥 token 还算钱？」——abort 关客户端读取，**之前生成的 token 已计入 usage**。abort = 「别再给我推」≠「之前免费」。abort 后通常**没 usage 报告**（流提前结束），要去控制台查实际用量。
3. **`res.write` 后 abort**：write 抛 `ERR_STREAM_DESTROYED`。try/catch 包一下再 break。
4. **`AbortSignal.timeout` 太短**：长 prompt + 慢模型 30 秒很正常，**别拍脑袋**。要么不设超时，要么设 60 秒以上。
5. **客户端断 vs 网络断**：浏览器关页面 → `req.on('close')`；网络断 → 同一个 close 事件（Node 实现通常会触发）。**别假设能区分**。
6. **abort 后没记日志**：「这个请求为什么没收到完整响应？」——客户端 abort 时服务端记一条 `[aborted at chunk N, 200ms in]`，排查用得上。本项目 `src/server.ts` 已发 `{event:'aborted'}` 帧。
7. **SDK 层抛错**：OpenAI SDK 包成 `APIUserAbortError`，不是原生 `AbortError`。**catch 时同时判**：`err.name === 'AbortError' || err.constructor.name === 'APIUserAbortError'`。
8. **signal 在 body 还是 options？** OpenAI v4 SDK 的 `signal` 是 **第二个 `options` 参数**（`RequestOptions`），不在 body 里。写成 `create({ ..., signal })` TS 类型报错；写成 `create(body, { signal })` 才通过。本项目已用正确形式。

## 过关自检

合上文件，能讲清：

1. **AbortController 三件套**：实例 + `.abort()` + `signal`。
2. **fetch / SDK 接 signal**：OpenAI SDK 把 `signal` 作为第二个 `options` 参数；Anthropic SDK 同。
3. **客户端 abort ≠ 服务端停**：abort 关客户端读取 / 底层 socket；服务端是否停看实现，多数情况关 socket 已经够。
4. **abort 后费用照算**：之前生成的 token 都计入 usage。
5. **CLI / HTTP / 浏览器三处用法**：CLI 接 SIGINT、HTTP 接 `req.on('close')`、浏览器接 `pagehide` 或 `beforeunload`。
6. **超时**：`AbortSignal.timeout(ms)`，但别拍脑袋给太短。
7. **厂商差异**：所有厂商都支持客户端 abort；服务端能不能立刻停生成看厂商；自部署是最坏情况。

## 还没搞懂的

- **abort 后那部分 token 是否扣费、能否拿到 usage**：客户端 abort 时通常**不返回 usage**（流提前结束）。最终费用 = 已生成的 token，**没有 usage 报告**。需要服务端日志对照。
- `AbortSignal.any([...])`：Node 20+ 「任一信号触发即 abort」的组合——可用于「用户取消 OR 超时 OR 网络断」。这次没展开。
- **OpenAI SDK v5 之后**：可能把 signal 放进 body 里；本次基于 v4（demo 与项目都装 v4）。升版后要再核一遍类型定义。