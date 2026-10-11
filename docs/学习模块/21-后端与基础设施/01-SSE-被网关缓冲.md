# **SSE 被网关缓冲**：Nginx / PaaS 默认可能攒满再发，流式会「卡住再一次性喷出」

> 对应模块：[模块 21 · 后端与基础设施 ⭐⭐⭐⭐](./README.md) · 小节进度第 1 条
> 本条笔记已写入小节文档（`coach start` 详解后由 Coach 写入）。

- **来源**：`coach start`（本对话详解，2026-10-10）
- **状态**：已沉淀

> 各节写什么、怎么判断归哪一节、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

### 是什么

**SSE（Server-Sent Events）** 是一种**服务端主动向客户端推送**的 HTTP 长连接协议——客户端发一次请求，服务端保持连接，**边生成边推送**数据到客户端。SSE 是 LLM 流式输出（一个字一个字吐）的事实标准。

```
客户端                          服务端
  │── GET /stream ────────────► │
  │                             │ （开始生成）
  │ ◄── data: hello ─────────── │ （第一个 chunk）
  │ ◄── data: world ─────────── │ （第二个 chunk）
  │ ◄── data: ... ───────────── │ （更多 chunk）
  │                             │ （生成完成，关闭连接）
```

**问题**：当**反向代理 / 网关 / CDN / PaaS 平台**插入客户端与服务端之间时，它们**默认会缓冲响应**——把上游的 chunk 攒满缓冲区，再一次性发给客户端。结果：

```
用户视角：30 秒没动静 ──────► 突然「哗」一下全部出来
```

LLM 流式输出**完全失去意义**——用户等 30 秒看到的还是一次性文本，体验比非流式还糟。

**触发条件**：你的服务前**有 Nginx / CDN / PaaS 平台 / 反向代理**；默认开启 `proxy_buffering on`。

一句话：**SSE 不是「长连接」就有用，是「边到边」才有用；网关缓冲把「边到边」变成了「攒满再发」**。

### 为什么（Agent 开发要懂）

Agent 的核心体验是**流式输出**——用户看着 AI 一个字一个字打字出来，比一次性返回整段体验好得多。一旦被网关缓冲：

具体后果（举四个最常见的）：

1. **Nginx 反向代理**：用户问 Agent 问题 → 30 秒没动静 → 突然整段喷出来 → 用户以为卡死 → 刷新页面 → 重复请求。
2. **Cloudflare CDN**：同上；Cloudflare 默认**开**缓冲，关起来要在每个边缘节点配。
3. **Vercel / Cloud Run / Lambda**：PaaS 平台的边缘网关默认缓冲，关法不统一——**Vercel 默认就是关的**，Cloud Run 默认**开**。
4. **公司内网反向代理**：开发环境没问题（直连），上线到生产走公司网关 → 流式「卡住再喷」→ 开发不知道是网关在缓冲。

Agent 流式上线 = **必须知道上游所有网关都关掉缓冲**，否则体验崩。

### 易混点

SSE 缓冲常被和它的「邻居机制」混淆。**判错任何一个都会让流式失效**——必须分清。

#### SSE vs WebSocket

| | SSE | WebSocket |
|---|---|---|
| **方向** | **单向**（服务端 → 客户端） | **双向**（客户端 ↔ 服务端） |
| **协议** | HTTP | 独立的 WS 协议（基于 HTTP Upgrade） |
| **适合** | LLM 流式输出 / 通知 / 日志流 | 实时聊天 / 协作编辑 / 游戏 |
| **代理友好** | **友好**（普通 HTTP） | **不友好**（需要 Upgrade 协议） |

**判错会怎样**：以为 SSE = WebSocket → 把 WebSocket 的部署坑（需要 Upgrade 协议）当成 SSE 的问题 → 实际上 SSE 走普通 HTTP，**更友好**。

#### SSE vs 长轮询（Long Polling）

| | SSE | 长轮询 |
|---|---|---|
| **连接** | 一个长连接 | 客户端反复发请求 |
| **延迟** | **低**（服务端立即推） | **高**（每次请求要重新建立） |
| **资源** | 一个连接占用服务端 | 反复建连开销 |
| **关系** | SSE 是长轮询的「升级版」 | 长轮询是 SSE 不可用时的兜底 |

**判错会怎样**：以为 SSE 和长轮询是同一个东西 → 不知道 SSE 的延迟优势（Web 聊天场景用 SSE 比长轮询快一个数量级）。

#### proxy_buffering off vs proxy_cache off

| | `proxy_buffering off` | `proxy_cache off` |
|---|---|---|
| **关什么** | 关**响应缓冲**（不攒 chunk） | 关**缓存**（不缓存完整响应给后续请求） |
| **防什么** | 流式「卡住再喷」 | 「上次同样的请求给同一个人」缓存 |
| **关系** | 流式必须关前者；后者视场景 | — |

**判错会怎样**：关了 `proxy_cache off` 但没关 `proxy_buffering off` → **流式仍然卡住**——缓冲和缓存是两个独立开关。

#### X-Accel-Buffering vs Cache-Control

| | `X-Accel-Buffering: no` | `Cache-Control: no-cache` |
|---|---|---|
| **告诉谁** | **Nginx**（特定反代） | **所有代理**（含 CDN / 浏览器） |
| **关什么** | 关 Nginx 的 proxy_buffering | 关**缓存**（含响应缓存） |
| **适合** | 你知道上游有 Nginx | 你不知道上游有什么代理 |
| **关系** | Nginx 优先认 `X-Accel-Buffering`；其他代理优先认 `Cache-Control` | — |

**判错会怎样**：只设了 `Cache-Control: no-cache` 但没设 `X-Accel-Buffering: no` → **Nginx 仍然缓冲**——`Cache-Control` 不管 Nginx 的缓冲行为。

#### CDN 缓冲 vs Nginx 缓冲

| | CDN 缓冲 | Nginx 缓冲 |
|---|---|---|
| **位置** | **分布式边缘节点**（用户就近） | 单点反代服务器 |
| **关法** | 逐节点配（Cloudflare / 七牛 / 阿里云控制台） | 单文件配置 |
| **难度** | 高（要逐 CDN 服务商配置） | 低 |
| **坑** | 每个 CDN 默认值不一样 | 配置文件 reload 才会生效 |

**判错会怎样**：只关了 Nginx 缓冲 → 用户走 CDN 边缘节点 → 仍然缓冲 → 「明明已经关了为什么还卡」。

### 核心概念（变体 / 分支全扫）

SSE 缓冲问题有 10 个变体。

#### 1. SSE 协议本质

**SSE** 是 HTTP 长连接协议，服务端用 `text/event-stream` MIME 推送：

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"chunk": "你好"}

data: {"chunk": "，"}

data: {"chunk": "我是"}
...
```

**核心**：**Chunked Transfer**——服务端每生成一段就 flush 一次，**不等全部生成完**。

**例子**：水管（SSE 直连）水边到边流。

**需求 1（SSE 协议演示）**：直接调 LLM 流式接口；用 `curl` 看 chunked response；记录每个 chunk 的到达时间。

#### 2. Nginx 默认缓冲行为

**Nginx 默认 `proxy_buffering on`**——把上游响应攒到 `proxy_buffer_size`（默认 4K / 8K）才发客户端。

| 配置 | 默认值 | 效果 |
|------|--------|------|
| `proxy_buffering` | `on` | **缓冲**（攒满再发） |
| `proxy_buffer_size` | 4k / 8k | 缓冲大小 |
| `proxy_buffers` | 8 4k / 8 8k | 缓冲数量 |

**例子**：水塔（Nginx 缓冲）先蓄满再喷。

**需求 2（Nginx 默认缓冲验证）**：本地起 Nginx 反向代理到流式服务；验证默认行为下用户侧是「卡住再喷」。

#### 3. Nginx 关 buffer 配置

```nginx
location /stream {
    proxy_pass http://backend;
    proxy_buffering off;                # 关响应缓冲
    proxy_cache off;                    # 关缓存
    proxy_set_header X-Accel-Buffering no;  # 双保险（也告诉上游）
    add_header X-Accel-Buffering no;    # 让浏览器/CDN 也知道
    proxy_read_timeout 3600s;           # 长连接超时（默认 60s 会断）
}
```

**核心三件套**：`proxy_buffering off` + `X-Accel-Buffering no` + 长 timeout。

**需求 3（Nginx 关 buffer 配置）**：配 Nginx 流式反代；验证用户侧是「边到边」。

#### 4. CDN 缓冲

| CDN | 默认 | 怎么关 |
|-----|------|--------|
| **Cloudflare** | 缓冲静态 + 流式 | Cache Rule + `Edge Cache TTL: 0`；或 `Cache-Control: no-store` |
| **七牛** | 缓冲 | 控制台「缓存配置」关掉 |
| **阿里云 CDN** | 缓冲 | 控制台「缓存策略」配置 |

**例子**：CDN 是分布式水塔，每个边缘节点都有水塔——得每个都关。

**需求 4（CDN 缓冲验证）**：用 Cloudflare / 七牛 CDN 测流式；验证是否被缓冲。

#### 5. PaaS / Serverless 平台缓冲

| 平台 | 默认 | 怎么关 |
|------|------|--------|
| **Vercel** | **默认关**（友好） | — |
| **Cloud Run** | 默认**开** | 设置 `proxy_buffering off` |
| **AWS Lambda + API Gateway** | 默认**开** | 配响应头 / 用 Function URL |
| **Heroku** | 默认关 | — |

**例子**：每个平台的水塔规则不一样——得逐个查。

**需求 5（PaaS 缓冲验证）**：用 Vercel / Cloud Run 测流式；对比默认行为差异。

#### 6. 响应头约定

| 头 | 作用 | 必须设 |
|----|------|--------|
| `Content-Type: text/event-stream` | 告诉客户端这是 SSE | ✅ 必须 |
| `Cache-Control: no-cache` 或 `no-store` | 告诉代理别缓存 | ✅ 必须 |
| `X-Accel-Buffering: no` | 告诉 Nginx 别缓冲 | ✅ Nginx 之前必设 |
| `Connection: keep-alive` | 保持长连接 | ✅ 必须 |

**核心响应头三件套**：SSE MIME + Cache-Control + X-Accel-Buffering。

**需求 6（响应头约定）**：在 Node / koa 流式接口里设齐三件套；验证每个头都到位。

#### 7. 流式健康检查

**怎么验证流式真在「边到边」**：

| 检查 | 怎么做 |
|------|--------|
| **curl 流式接口** | `curl -N` 看每个 chunk 到达时间 |
| **浏览器 DevTools** | Network → 看响应是 chunked |
| **时间戳打点** | 服务端每个 chunk flush 时打时间戳 |
| **首 token 时间** | 用户发起请求到看到第一个字的时间 |

**判断标准**：流式第一个 chunk 应该在 **1~3 秒**（首 token 延迟）；不是 30 秒。

**需求 7（流式健康检查）**：用 curl + 时间戳验证 100 次流式；统计首 token 时间分布。

#### 8. 长连接超时

Nginx 默认 `proxy_read_timeout 60s`——**60 秒没数据就读超时 → 断流**。LLM 长任务（生成 5 分钟）会中途断。

| 配置 | 默认值 | 流式需要 |
|------|--------|----------|
| `proxy_read_timeout` | 60s | 3600s 或更长 |
| `proxy_send_timeout` | 60s | 3600s 或更长 |
| `keepalive_timeout` | 75s | 3600s |

**例子**：长跑运动员（SSE 长连接）跑到一半被掐表（60s 超时）→ 流式中断。

**需求 8（长连接超时）**：配 Nginx 长 timeout；验证 5 分钟生成任务不被断。

#### 9. 监控告警：流式断流检测

流式被断要立刻发现：

| 指标 | 怎么算 |
|------|--------|
| **首 token 时间** | 用户发起 → 第一个 chunk |
| **平均 chunk 间隔** | 连续两个 chunk 间隔均值 |
| **流式成功率** | 完整收到所有 chunk 的请求比例 |
| **断流位置分布** | 第几个 chunk 断的比例 |

**例子**：水管流量监控——发现某用户水管突然没水（断流）→ 立刻告警。

**需求 9（流式监控告警）**：实现 4 类指标；命中时告警（首 token > 5s / 断流 > 1%）。

#### 10. 跨代理链路

生产链路通常是：**浏览器 → CDN → Nginx → App**——每个环节都可能缓冲。

| 环节 | 可能缓冲 | 怎么关 |
|------|----------|--------|
| **浏览器** | 不缓冲（看到 chunked 响应立即显示） | — |
| **CDN** | **默认缓冲** | 控制台 + 响应头 |
| **Nginx** | **默认缓冲** | `proxy_buffering off` + `X-Accel-Buffering no` |
| **App** | 不缓冲（直接流式输出） | — |

**关键**：**所有代理层都要关**——漏一层流式就卡。

**需求 10（跨代理链路）**：起完整链路（CDN + Nginx + App）；验证每层都关 buffer；用 curl 模拟逐层穿透。

### 例子

#### 水管 vs 水塔

水管（SSE 直连）水边到边流；水塔（Nginx 缓冲）先蓄满再喷。

对应：**Nginx 默认 proxy_buffering on = 水塔**。

#### 直播弹幕 vs 录播重发

直播弹幕（SSE 流式）字一个字出来；录播重发（缓冲）整段录完一起放。

对应：**流式用户体验 = 直播弹幕**。

#### 新闻推送 vs 报纸订阅

新闻推送（SSE 流式）边发生边推；报纸订阅（缓冲）等整份报纸印好一起送。

对应：**SSE 是新闻推送；缓冲是报纸订阅**。

#### 公司内网代理坑

开发环境（直连 Node）流式正常 → 上生产走公司网关（反向代理）→ 流式卡住 → 开发不知道是网关缓冲。

对应：**上线后才发现，开发体验 ≠ 生产体验**。

#### 60 秒掐表坑

LLM 写代码任务跑了 90 秒 → Nginx `proxy_read_timeout 60s` → 第 61 秒断流 → 用户看到一半结果。

对应：**长任务必须设长 timeout**。

#### CDN 节点坑

用户 A 走北京 CDN 节点流式正常 → 用户 B 走上海 CDN 节点 → 上海节点缓冲配置忘改 → 用户 B 流式卡。

对应：**每个 CDN 节点都要单独配置**。

### 需求清单

> **模块 14 及之后**：下面的演示要求**写进学习者单独的真实项目**，不写进本仓库 `apps/`。`coach complete` 在进度表打钩时只对笔记里的变体覆盖逐条过，不对 `apps/` 跑 §5.4。

| # | 需求 | 场景 | 目标 | 涉及变体 | 验收标准 |
|---|------|------|------|----------|----------|
| 1 | **SSE 协议演示** | curl 直连 LLM 流式接口 | 看 chunked response | 变体 1 协议 | chunk 到达时间 < 3s |
| 2 | **Nginx 默认缓冲验证** | 起 Nginx 反代 | 验证「卡住再喷」 | 变体 2 Nginx 默认 | 首 token 时间 > 30s |
| 3 | **Nginx 关 buffer 配置** | 配 Nginx 流式反代 | 验证「边到边」 | 变体 3 Nginx 配置 | 首 token 时间 < 3s |
| 4 | **CDN 缓冲验证** | Cloudflare / 七牛测流式 | 验证 CDN 缓冲 | 变体 4 CDN | 关 buffer 前后对比 |
| 5 | **PaaS 缓冲验证** | Vercel / Cloud Run 测流式 | 验证 PaaS 行为差异 | 变体 5 PaaS | 平台默认行为表 |
| 6 | **响应头约定** | Node / koa 流式接口 | 设齐 SSE 三件套 | 变体 6 响应头 | 三件套全部到位 |
| 7 | **流式健康检查** | curl + 时间戳 100 次 | 首 token 时间分布 | 变体 7 健康检查 | 首 token < 3s 占比 ≥ 95% |
| 8 | **长连接超时** | 配 Nginx 长 timeout | 5 分钟任务不断流 | 变体 8 超时 | timeout 3600s |
| 9 | **流式监控告警** | 4 类指标 + 告警 | 首 token + 断流 | 变体 9 监控 | 命中时告警延迟 < 60s |
| 10 | **跨代理链路** | CDN + Nginx + App 完整链路 | 每层都关 buffer | 变体 10 链路 | 全链路首 token < 3s |

### 我追问过的

本对话学习者本轮未提出知识类追问（仅下了 `coach start` / `把笔记写进小节文档` 两条命令）。无内容可沉。

### 过关自检

- **知道生产流式要关 buffer**：见「是什么」（核心问题）+「为什么」（4 个具体后果）+「核心概念 2~5」（4 种缓冲来源：Nginx / CDN / PaaS / 跨代理）。
- 能说**Agent 开发为什么要懂**：见「为什么」（4 个具体后果：Nginx / Cloudflare / Vercel-Cloud-Run / 公司内网）。
- 能区分**SSE vs WebSocket / SSE vs 长轮询 / proxy_buffering vs proxy_cache / X-Accel-Buffering vs Cache-Control / CDN vs Nginx**：见「易混点」五组对比。
- 能说出 SSE 缓冲的 **10 个变体**：见「核心概念 1~10」。
- 能写出**每条业务需求覆盖哪个变体**：见「需求清单」第 1~10 行。

### Demo

Demo：无。模块 14 及之后这一段只检查笔记，不检查代码。需求清单的演示做在学习者单独的真实项目里，不写进本仓库 `apps/`。