# **stdio vs Streamable HTTP**：本地玩具 vs 远程 + 按用户鉴权

> 对应模块：[模块 12 · MCP ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 2 条
> 这一小节由 Coach 按 2026-09-18 本对话 `coach start` 详解首次写入；同日追问把「同一份 Demo 必须同时有提供端和调用端、三种原语都要能从自己的代码调到自己的本地服务」写进需求清单。**2026-09-18 同日下午**写出三份真实可跑的 demo（`02-stdio-vs-Streamable-HTTP-step-1` + `…-step-2-mcp-server` + `…-step-2-mcp-client`），并把 SDK 2.0 强依赖 zod v4、`stdio` 是 Transport 而不是协议、stdio 子进程被父进程自动 spawn 不需要先连等踩坑沉淀到「我追问过的」「踩坑」「契约记录」。**2026-09-18 同日傍晚**把 step-2 两个 demo 的 MCP endpoint 合一到 koa 同进程同端口（清掉跨段 40001，5 段连续 50133/50134/50135）。学习者只减不加。进度表仍 ⬜，在进度表打钩只走 `coach complete`。Skills / `AGENTS.md` 对照是本模块第 3 条，本文件只点边界，不把那一小节当新课写完。

- **来源**：本对话 `coach start` 详解（对照上一节 MCP 架构、模块 05 工具网关里的按用户委托授权；规范 [Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) / [Streamable HTTP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) / [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)）+ 本对话追问（调用端与提供端、官方 SDK、同一 Demo 成对）
- **状态**：已沉淀
- **Demo**：可运行 · 已写出三份（见 [## Demo 子节进度](#demo-子节进度) 实际写入的三个 `apps/12-MCP/02-stdio-vs-Streamable-HTTP-*` 兄弟文件夹；step-1 是 stdio 玩具，step-2 拆成 mcp-server + mcp-client 两个独立进程互相对照）

> 各节写什么、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

## 是什么

上一节把模型上下文协议（MCP / Model Context Protocol）拆成两层：**数据层（Data Layer）**管「说什么」（`tools/list`、`resources/read`、`prompts/get`），**传输层（Transport Layer）**管「走哪根管子、怎么验身份」。这一小节只讲管子和管子上的身份。JSON-RPC 方法名不换。

规范现在给了两根标准管子：

1. **标准输入输出（stdio）**：客户端把服务端当成**本机子进程**拉起来。JSON-RPC 一行一条，从标准输入（stdin）进、从标准输出（stdout）出；日志走标准错误（stderr）。客户端关掉，子进程一起没了。凭据从**环境变量**拿。规范写明：stdio **不应该**走 HTTP 那套 OAuth 流程。
2. **可流式 HTTP（Streamable HTTP）**：服务端是**独立进程**，对外一个 MCP 端点（MCP endpoint），例如 `https://tickets.example.com/mcp`。客户端每条 JSON-RPC 对这个地址打一次 HTTP POST。可以回一个 JSON，也可以回只属于这一次请求的服务器发送事件（SSE）流。同一端点能接很多个客户端。远程应当鉴权。

还可以自定义管子，这一小节不展开。客户端「能跑本机服务端时，应尽量支持 stdio」——所以 Cursor 连你电脑上的文件系统服务端，用 stdio 完全正常。这一小节要讲清的是：**给很多用户、跨机器、要按人鉴权的生产形态，不能停在 stdio。**

### stdio 数据怎么走

1. 客户端 `spawn` 服务端子进程（不是服务端先在那儿等你）。
2. 往 stdin 写一行 JSON-RPC，从 stdout 读回一行。消息里不能夹换行。
3. 服务端绝对不能往 stdout 打普通 `console.log`，否则客户端会把日志当成一条坏掉的协议消息。
4. 客户端退出 → 子进程结束。一根 stdin/stdout = 一对一。

### Streamable HTTP 数据怎么走

1. 服务端自己先听端口，客户端事后连 URL。
2. 每次 JSON-RPC 是一次 HTTP POST；`Accept` 里同时声明能收 `application/json` 和 `text/event-stream`。
3. 本机若用 HTTP 管子，应只绑 `127.0.0.1`，并校验 `Origin`，防止 DNS 重绑定（DNS rebinding）。
4. 远程 HTTP **应当**鉴权。没令牌用 HTTP 401，不要做成 `tools/call` 的业务报错。

2024-11-05 的「HTTP + SSE」是**两个端点**（GET 长连接收消息、POST 发消息），从 2025-03-26 起被 Streamable HTTP 替换，已过时。2026-07-28 对 Streamable HTTP 又收紧过（独立 GET 流、协议级会话被拿掉）。这一小节不要求背报文；搜到旧教程不要照着做生产。

### 管子上的身份

| 形态 | 钥匙怎么发 | 人话 |
| ---- | ---------- | ---- |
| stdio | 环境变量 | 贴在这台电脑这个进程上，没有「用户 A / 用户 B」 |
| HTTP 最简 | API 令牌（API Token），请求头 `Authorization: Bearer …` | 证明「你知道这扇门的密码」；一把共享令牌 ≠ 已经按用户隔离 |
| HTTP 生产 | OAuth 2.1：MCP 服务端当资源服务器（Resource Server），客户端带访问令牌（Access Token）；令牌受众（audience）必须是这个 MCP 服务端 | 每个人以自己的身份进管子 |

模块验收：**HTTP 至少做到 API 令牌；OAuth 2.1 + 按用户隔离必须能讲清，实现可最简。**

这和模块 05 工具网关（Tool Gateway）里「用户委托授权」是同一类事故、不同一层：模块 05 问的是宿主执行工具时调 Gmail / 工单 HTTP **用谁的身份**；这一小节问的是 MCP 客户端连**远程 MCP 服务端**时 **用谁的身份进这根管子**。

### 这一小节的 Demo 必须成对（提供端 + 调用端）

传输层要能看见，两端都得在。学习者明确要求：不要再只做「手搓 JSON-RPC 形状、页面假装连上」；要用 Node.js 写出一份**本地 MCP 服务端**，三种原语都挂上，再在**同一份 Demo 的 TypeScript 里用 MCP 客户端去调这份本地服务**。

```text
页面（宿主 Host）
  → 本 Demo 里的 MCP 客户端（Client）——「用」服务
      → 本机 Node 起的 MCP 服务端（Server）——「提供」工具 / 资源 / 提示词模板
```

提供端缺了，调用端没对象；调用端缺了，服务端只是一份没人连的进程。接进 Cursor 是模块验收后段（用现成宿主，不重写 Cursor），不是这一小节第一刀必须交的产品。

官方 TypeScript SDK 现行是 v2（对应 2026-07-28 规范），服务端包和客户端包拆开，见「契约记录」。

## 为什么（Agent 开发要懂）

「生产形态不是 stdio」不是骂 stdio 没用。stdio 是本机、单用户、跟 IDE 同生共死的正确形态。生产要的是下面这些，stdio 天生给不出：

1. **服务端不能住在员工笔记本里。** 夜班云上 Agent 没法在张三电脑上 `spawn` 一个子进程。工单后厨必须是一个 URL。
2. **进程生命周期不能绑在某一个客户端上。** stdio 里客户端走了后厨就停；生产要很多人同时连。
3. **一根 stdin/stdout 接不了全公司值班台。** 远程 HTTP 的同一端点本来就是多连接。
4. **身份必须按人发，不能只靠这台电脑的环境变量。** 环境变量里的 `GITHUB_TOKEN` 是「这台机器的上帝钥匙」。
5. **运维和安全模型是 HTTP 服务那一套。** 网关、TLS、令牌吊销、审计「谁 call 了 create_ticket」，都挂在请求上。

不懂会怎样：只在自己 Cursor 里跑通 stdio，就以为 MCP 上线了；一给同事用、一放到云上 Agent，后厨不存在，也没有按用户的 401。

另一类后果：只有服务端没有调用端（或反过来）——关上文件讲不清「谁在提供、谁在用」，也验证不了三种原语是否真的从自己的代码走到自己的进程。

## 易混点

**1. stdio 没过时，过时的是「只做 stdio 就当生产」。**  
本机工具用 stdio 是正路。错的是远程多人产品还用「每人电脑起一个子进程、密钥在环境变量」。

**2. 开在本机 127.0.0.1 的 HTTP，仍然是 HTTP 管子，不是 stdio。**  
有没有端口、是不是 POST，比「是不是 localhost」更决定它是哪根管子。

**3. Streamable HTTP ≠ 已经过时的「HTTP + SSE 双端点」。**  
旧教程两个 URL；现行一个 MCP 端点 + POST。SSE 只是某一次 POST 的响应形态。

**4. 传输层鉴权 ≠ 工具网关里的鉴权。**  
没带令牌连不上服务端 = 这一小节。已经连上了，模型要删工单还要不要二次确认 = 模块 05 / 11。

**5. API 令牌 ≠ 已经按用户隔离。**  
一把共享 Bearer 只能证明「你知道密码」。张三李四的工单分开，要靠令牌绑用户，并且服务端强制过滤。

**6. 提供端和调用端不是两份无关作业。**  
同一份 Demo 里必须两边都有。产品级调用端（Cursor）已经存在——「接进 Cursor」是配你的服务端，不是去实现 Cursor。自己的 Agent 当 MCP 客户端是模块验收后段，可以等管子看懂再做。

**7. 上一节的教学路由 ≠ 这一节的 MCP 服务端。**  
上一节用 koa 路由演示 JSON-RPC 形状。这一节要用官方 SDK 起真正的服务端，再用官方客户端去调，而不是再手搓一套 `POST /api/mcp/tools-list`。

**8. 大模型仍然不直连 MCP 服务端。**  
换 HTTP 之后也一样：用户 ↔ 宿主 ↔ 客户端 ↔ 服务端。

**9. Skills / `AGENTS.md` 不是这一小节。**  
下一小节：领域行为怎么打包。MCP 管子不管「客服该怎么说话」。

## 例子

贯穿场景：电商客服值班台的工单后厨。

### 例子 1 · stdio（本机子进程）

开发时 Cursor 配 `command: node ticket-mcp.js`。宿主拉起子进程，环境变量里塞开发密钥。`tools/list` 从 stdout 回来。你关掉 Cursor，工单 MCP 进程也没了。同事笔记本上没有这个进程。

生活：自己厨房炒菜，你走火就关。  
前端：`child_process.spawn` + 用 stdin/stdout 当 `postMessage`，没有给别人连的端口。

### 例子 2 · Streamable HTTP（独立进程 + URL）

工单 MCP 跑在公司集群（或本机一个 HTTP 端点）。网页值班台和云上夜班 Agent 各自 POST `tools/list`。你关笔记本，后厨还在。

生活：中央厨房对外公布电话号码。  
前端：你熟悉的 HTTP API；SSE 只是这一枪的响应可以流着回来。

### 例子 3 · 换管子、方法名不变

左右对照同一条 `{"method":"tools/list"}`。左边是写入子进程 stdin；右边是 `POST /mcp`。两边返回的工具名都是 `create_ticket`。差的是管子，不是原语。

### 例子 4 · 同一份 Demo 里自己提供、自己调用（本对话明确要求）

Node.js 在本机起一份 MCP 服务端：工具 `create_ticket`、资源退货政策、提示词模板退款话术。同一 Demo 的 TypeScript 用 MCP 客户端连过去：先 list 再 call / read / get。页面上能指出「哪份文件是服务端、哪份是客户端」，三种原语都有一次真实往返。

这不是两个 Demo，是一对。缺任何一端，这一小节的「我能自己写 MCP 并在代码里调」就没落地。

### 例子 5 · 没令牌 vs API 令牌

同一 `POST /mcp`：不带 `Authorization` → HTTP 401，JSON-RPC 还没开始。带对 Bearer → 进入 `tools/list`。带错令牌也是 401，和「工具不存在」不是一类错。

### 例子 6 · 张三 / 李四隔离 vs 上帝令牌

张三令牌建了工单 A-1001。李四令牌 list 看不到它。交叉读失败可观察。一把公司上帝令牌能看见全部——对照里标成反例。

### 例子 7 · 为什么云上 Agent 不能用 stdio（本条要能讲清）

夜班 Agent 跑在云主机，工单数据在公司机房。stdio 要求客户端把服务端 spawn 在同一台机器。云主机上没有张三的子进程，也没有张三笔记本环境变量里的密钥。所以生产是：服务端先以 HTTP 活着，客户端带这个用户的令牌来连。

### 例子 8 · OAuth 2.1 角色（概念，实现可最简）

张三点「连接工单系统」→ 公司登录页同意 → 访问令牌只对这个 MCP 服务端这个受众有效 → 之后每次 POST 都带它。这一小节用角色图 + 401 形状即可，不搭完整 SSO。

## 变体对照（需求清单的索引）

| 变体 | 例子 | 需求 | 可观察？ |
| ---- | ---- | ---- | -------- |
| 同一 Demo：Node 提供端三种原语 + 本 Demo 客户端去调 | 例子 4 | 需求 1 | 是（step 尚未写出） |
| stdio：子进程 + stdin/stdout + 环境变量 | 例子 1 | 需求 2 | 是 |
| Streamable HTTP：独立进程 + 单端点 POST | 例子 2 | 需求 3 | 是 |
| 同一 JSON-RPC 换管子 | 例子 3 | 需求 4 | 是 |
| 过时 HTTP+SSE 双端点 | 是什么末段 | 纯知识（页面注解） | 注解即可 |
| HTTP 无鉴权 → 401；API 令牌能进 | 例子 5 | 需求 5 | 是 |
| 按用户隔离 vs 上帝令牌 | 例子 6 | 需求 6 | 是 |
| OAuth 2.1 角色与受众（概念） | 例子 8 | 需求 7 | 概念卡；实现可最简 |
| 生产不是 stdio（云上 Agent） | 例子 7 | 叠在需求 3+5+6 | 对照讲清 |

## 需求清单

验收准绳，不是 step 生产的驱动器。step 仍按知识动态推进；`coach complete` 在进度表打钩时才按需求逐条对。场景串成同一个电商客服值班台。

**需求 1 · 同一份 Demo 必须同时有提供端和调用端（本对话明确写入）**  
- 业务场景：你要能用 Node.js 在本机提供一份 MCP 服务，并且在当前这份 Demo 的代码里去调用它，而不是只看教学 JSON。  
- 目标：提供端用官方服务端 SDK 挂上三种原语（至少 1 个工具、1 个资源、1 个提示词模板）；调用端用官方客户端 SDK 连这份**本地**服务，把三种原语都走一遍（list + 真正用起来）。  
- 涉及本节哪些知识点：宿主 / 客户端 / 服务端成对出现；三种原语仍是上一节的控制权；这一节用真 SDK 把「提供」和「使用」接到同一根管子上。  
- 验收标准：能指出哪份代码是 MCP 服务端（Server）、哪份是 MCP 客户端（Client）；页面上能分别看到 `tools/list`→`tools/call`、`resources/list`→`resources/read`、`prompts/list`→`prompts/get` 的请求参数 / 调用流程 / 响应结果；不是只打印了一段假 JSON。

**需求 2 · 看见 stdio 管子**  
- 业务场景：开发时在本机用子进程连工单 MCP。  
- 目标：客户端拉起子进程，stdin 写协议，stdout 读回，关掉客户端后子进程结束。  
- 涉及：stdio 生命周期、换行分隔的 JSON-RPC、凭据走环境变量。  
- 验收标准：能看到子进程被启动和退出；请求路径不是 HTTP URL；没有 `Authorization` 头。

**需求 3 · 看见 Streamable HTTP**  
- 业务场景：工单 MCP 以独立 HTTP 服务活着，值班台去连 URL。  
- 目标：对一个 MCP 端点 POST JSON-RPC；服务端在客户端没连时也可以已经在听。  
- 涉及：独立进程、单端点、可多连接。  
- 验收标准：能看到 POST 目标 URL；两次独立请求都能打到同一服务端，不靠「再 spawn 一个子进程」。

**需求 4 · 换管子、方法名不变**  
- 业务场景：同一份工单能力，开发走 stdio，上线走 HTTP。  
- 目标：对照两侧都是同一套 list/call、list/read、list/get，返回的名字一致。  
- 涉及：数据层 vs 传输层。  
- 验收标准：两侧独立请求（不要一个接口打包跑两根管子）；对照里能指出「差的是管子，不是原语」。

**需求 5 · HTTP 必须鉴权（至少 API 令牌）**  
- 业务场景：公网可达的工单 MCP 不能裸奔。  
- 目标：无令牌 / 错令牌 → HTTP 401；对令牌 → 进入 JSON-RPC。  
- 涉及：传输层鉴权、401 vs JSON-RPC 业务错。  
- 验收标准：页面能分开「没登录」和「工具不存在」两种失败。

**需求 6 · 按用户隔离，上帝令牌是反例**  
- 业务场景：张三、李四都用远程工单 MCP。  
- 目标：各用各的令牌，list/read/call 互不可见；共享上帝令牌能看见全部（标成反例）。  
- 涉及：按用户鉴权、和模块 05 委托授权同构不同层。  
- 验收标准：切换用户身份后清单不同；交叉读取失败可观察。

**需求 7 · 能讲清 OAuth 2.1 生产形态（实现可最简）**  
- 业务场景：公司要用 SSO 让每个人以自己的身份连工单 MCP。  
- 目标：能画出用户 / MCP 客户端 / MCP 服务端（资源服务器）/ 授权服务器；能说出访问令牌每次请求都带、受众必须是这个 MCP 服务端。  
- 涉及：OAuth 2.1、stdio 不走这套。  
- 验收标准：概念卡或 401 + `WWW-Authenticate` 形状能对上角色图；不要求这一步搭完整授权服务器。

## 我追问过的

| 问题 | 针对什么 | 回答 |
| ---- | -------- | ---- |
| 这一小节会要求我实现一个 MCP 服务吗？调用端和提供端都需要做吗？ | 把「这一小节作业」和「整模块验收」混在一起；不清楚谁写服务端、谁写客户端、要不要重写 Cursor | 答在「是什么 · 这一小节的 Demo 必须成对」和易混点 6。这一小节演示里两端都要有，但分量不同：提供端要写一份教学服务端；调用端是本 Demo 的 TypeScript 客户端，不是去实现 Cursor。接进 Cursor、自己的 Agent 当正式 MCP 客户端，是模块验收后段。 |
| 最后我要能自己写 MCP 服务、三种原语都能在我的代码里调用；应该装官方 SDK | 上一节是手搓 JSON-RPC 形状，担心这一节还是假连，对不上以后自己写服务 | 答在「是什么 · 这一小节的 Demo 必须成对」和易混点 7。要用官方 v2 SDK：服务端包注册三种原语，客户端包在本 Demo 代码里调本地服务。装包清单在「契约记录」。 |
| 希望 Demo 是 Node 提供 MCP 例子（三种原语都有），当前 Demo 去调这份本地服务；既然会调，本地服务端也必须有，还要有「使用 MCP 服务」这一面 | 提供端和调用端被理解成两个无关 Demo，或只有其中一面 | 答在例子 4 和**需求 1**。同一份 Demo 成对：Node 本地 MCP 服务端提供三种原语；同一 Demo 的客户端去用它。缺任何一端都不算这一小节的落地。 |
| stdio 算「通信协议」吗？它是不是只是「连接方式」？ | 把 Transport（连接方式）和 Protocol（报文格式）混在一起讲，担心后续 Streamable HTTP 也是协议 | stdio 是 **Transport（连接方式 / 传输方式）**，不是协议。MCP 用的协议是 **JSON-RPC 2.0**（一种「用 JSON 当报文」的远程调用协议），同一段 JSON-RPC 报文可以走 stdio、HTTP、别的管子。打个比方：协议是普通话 / 四川话（内容怎么编码），Transport 是电话线 / 4G / WiFi（通道是什么）。stdio 是「你和隔壁桌递纸条」；Streamable HTTP 是「通过邮局寄信」。**内容语言没变，通道换了**。 |
| 没点「启动吧台」为什么也能列出工具？stdio 的「连接」是什么？ | 看到 `/api/stdio/list-tools` 也能跑，以为必须先点 `/api/stdio/connect` | 这是 stdio 的真实行为，不是 bug。第一次调任何 MCP 方法时，Client 端 `getOrCreateClient()` 自动走 spawn 子进程 + 握手。「启动吧台」按钮不是为了 MCP 协议而设，只是**显式把 spawn + 握手这一步拎出来给你看**——让你点完能看见一个真 pid 和启动时刻。stdio 没有「连接对象」可以单独管理，你能管理的只有「子进程是否还活着」和「当前 client 单例」。这跟 HTTP 完全不同：HTTP 是每次请求一个连接、用完关；stdio 是一个连接用到底、对应一个子进程。 |
| `package.json` 的 step-2 脚本端口为什么不是从 50134 开始连续？后来为什么把 MCP endpoint 合到 koa 端口？ | 注意到 koa 状态页是 50180 / 50182，没跟 step-1 的 50133 连续；后来又看到 MCP endpoint 在 40001 跨段 | §5.3.3 严格走应该是 `max(已占用) + 1`：step-1 = 50133 → step-2 koa = 50134、step-2 Client = 50135，连续三个 5 段口。最初 40001 是因为 MCP SDK 的 `transport.handleRequest` 需要 Node 原生 req/res，koa 抽象担心截断 SSE，**额外** listen 原生 http。实测发现 koa 的 `ctx.req` / `ctx.res` 就是 Node 原生对象，配合 `ctx.respond = false` 让 koa 不写自己的 response，**可以让 MCP endpoint 走 koa 同进程同端口**——5 段连续、清掉跨段口、`apps/README.md` 占用表一行收口。 |

## 取舍

| 做法 | 什么时候用 | 代价 |
| ---- | ---------- | ---- |
| stdio | 本机、单用户、跟 IDE 同生共死的开发工具 | 跨机器、按用户鉴权、独立扩容都做不到 |
| Streamable HTTP | 远程、多人、要当服务来运维 | 要鉴权、要处理 Origin / 绑回环地址 |
| 手搓 koa 路由演示 JSON-RPC 形状 | 上一节只认「谁连谁 / 三种原语」 | 对不上以后自己写的 MCP 服务端，也没有真的客户端 SDK |
| 官方 SDK 服务端 + 官方 SDK 客户端 | 这一节及以后自己写服务、在代码里调 | 要装 v2 两个包（HTTP 再加 node 适配） |
| HTTP 只做一把共享 API 令牌 | 教学最低实现、内网锁门 | 所有人在服务端看来是同一个人 |
| OAuth 2.1 + 按用户隔离 | 生产远程 MCP | 实现重；这一小节概念必须有，代码可最简 |

这一小节默认教学取向：先用官方 SDK 把「自己提供、自己调用」跑通（需求 1），管子对照 stdio 和 HTTP；鉴权从 API 令牌加深到按用户；OAuth 讲清角色即可。

## 踩坑

- **只做 stdio 就当生产。** 云上 Agent 没有员工本机的子进程。
- **stdio 子进程往 stdout 打日志。** 协议和日志抢同一根管子，客户端解析失败。
- **把 2024 年「GET 一个 SSE + POST 一个消息」当现行。** 那是已过时的 HTTP+SSE。
- **一把上帝令牌给所有用户。** 和模块 05 的平台上帝 Key 是同一类事故。
- **只有服务端或只有调用端。** 关上文件讲不清自己能不能写、能不能调。
- **把 MCP 当成新的 `tool_call` 字段。** 模型侧还是模块 05；这一节换的是管子和身份。
- **令牌透传。** MCP 服务端必须校验令牌是签给自己的；拿着客户端的令牌再去打别的内部 API，是混乱代理（confused deputy）一类问题。完整安全课在模块 20。
- **MCP SDK 2.0 硬依赖 zod v4，不是 v3（实测踩坑 · 2026-09-18）。** `apps/` 顶层装的是 `zod 3.25`，看似提供 `zod/v4` 子路径，但那是 v3 的兼容层、缺 `jsonSchema` 字段；SDK 2.0 在 `normalizeRawShapeSchema` 内部用 `looksLikeZodV3` 直接 `throw TypeError("Raw-shape inputSchema/outputSchema/argsSchema fields must be Zod v4 schemas…")`，并且 `registerTool` / `registerResource` 在类型层要 `ZodType.toJSONSchema`。**修法**：在用到 MCP SDK 的 demo 自己 `node_modules/zod` 里**链到 SDK 自带的 zod 4.6.5**（`@modelcontextprotocol/server/node_modules/zod`），不污染顶层 `apps/.env` 之外的依赖。**禁止**直接装 zod 4 到顶层——会炸其它用 zod 3 API 的 demo。
- **`@modelcontextprotocol/server/stdio` 与 `/node/stdio` 别装错。** `StdioServerTransport` 在 `@modelcontextprotocol/server/stdio`；`StdioClientTransport` 在 `@modelcontextprotocol/client/stdio`。两包都拆出来单独子路径，不是吃主入口。
- **StreamableHTTPClientTransport 构造时传 `new URL(serverUrl)`，不是字符串。** SDK 2.0 类型签名是 `constructor(url: URL, options?)`；传字符串会被 TS 报"Expected 1 arguments, but got 2"或运行时直接抛。
- **stdio Transport 父进程每次请求自动 spawn 子进程。** 见「我追问过的」第二条：「启动吧台」按钮**不是**用户必须主动做的一步，只为了教学可见；不点也能跑。
- **stdio Transport 对 stdin/stdout 干净度极敏感。** Claude Code 的 zsh hook 在终端面板上会向子进程 stdin 注入 `__zsh_ai_assistant_claude__load_history…` 一坨，污染 JSON-RPC 通道导致 `Connection closed`。**调试时**别被终端输出迷惑——实际污染可能来自 shell 而不是子进程；要看 `logs/{YYYY-MM-DD}.log` 而不是终端。

## 契约记录

- 官方 TypeScript SDK 现行 **v2**（2026-07-28 规范）。`apps/package.json` 已装：
  - 提供端：`@modelcontextprotocol/server`
  - 调用端：`@modelcontextprotocol/client`
  - Node / koa 适配（StreamableHTTPServerTransport）：`@modelcontextprotocol/node`
  - **不要**用旧单体包 `@modelcontextprotocol/sdk`（v1）。
- zod 双版本：`apps/` 顶层 zod 是 3.25（兼容层）；MCP SDK 2.0 自带 zod 4.6.5。在用到 MCP SDK 的 demo 自己 `node_modules/zod` 里**链到** `@modelcontextprotocol/server/node_modules/zod`，避免顶层升级炸其它 demo（见「踩坑」第七条）。
- step-1 / step-2 已实际写出（见 [## Demo 子节进度](#demo-子节进度)）。

## Demo 子节进度

| 状态 | 子节 | 入口 | 端口 | 本子节教学点 |
|------|------|------|------|--------------|
| ✅ | step-1 stdio 玩具 | `yarn app:12-02-stdio-vs-http-step-1` | `50133` | stdio Transport 长什么样：父进程真 `spawn` 一个 tsx 子进程跑 `lib/mcp-server/server.ts`，父子之间走 stdin/stdout；杀父进程子进程跟着死；类 A 错误（Connection closed）+ 类 B 错误（tool / resource 不存在）已可观察 |
| 🔄 | step-2 MCP Server 端（独立 listen） | `yarn app:12-02-stdio-vs-http-step-2-mcp-server` | `50134`（koa 同端口：浏览器 + MCP endpoint POST /mcp） | Streamable HTTP Transport：Server 只 listen 一个 koa 端口；MCP endpoint 走同进程 `POST /mcp` route（`ctx.respond = false` 让 koa 不拦 SSE）；`sessionIdGenerator` stateful 模式生成 mcp-session-id；status 页能看到 serverPid + endpoint URL |
| 🔄 | step-2 MCP Client 端（连远端） | `yarn app:12-02-stdio-vs-http-step-2-mcp-client` | `50135` | Streamable HTTP Transport：Client 进程不拥有 Server；走 `StreamableHTTPClientTransport(new URL(...))` 连 `http://127.0.0.1:50134/mcp`；杀 Client demo Server 不受影响、杀 Server demo Client 这边拿到 connection refused |

5 段端口连续 50133 / 50134 / 50135；不再有跨段口（MCP endpoint 跟 koa 状态页同进程同端口）。

锁定时机由学习者决定（`## 交互检查点协议`），**§5.3.2 6 项齐 + check-demo 过 + `cd apps && yarn typecheck` 过**才标 ✅。`coach complete` 在进度表给这一小节打钩前：`knowledge.md` 与「本条要能讲清」已对齐 + 至少 1 个 step 锁定。

## 过关自检

关上文件后还能讲出来（对应进度表「本条要能讲清」）：

1. stdio：谁启动谁、消息走哪两个标准流、客户端退出后服务端怎样、钥匙从哪来。
2. Streamable HTTP：谁先活着、一个端点、POST 发 JSON-RPC、为什么能服务很多客户端。
3. **生产形态为什么不是 stdio**：人跨机器、进程要独立活、要按用户发令牌、要当 HTTP 服务来运维——各举值班台里的一句后果。
4. 同一份 Demo 里：谁是提供端、谁是调用端；三种原语怎样从自己的客户端打到自己的本地服务端。
5. API 令牌和按用户隔离差在哪；OAuth 2.1 里谁是资源服务器。
6. 旧「HTTP + SSE 双端点」为什么不要当现行实现。

## 还没搞懂的

- OAuth 2.1 完整发现（受保护资源元数据、PKCE、`resource` 参数）随规范版本变；这一小节只要求角色和「每次请求带令牌、受众是自己」。
- Streamable HTTP 在 2026-07-28 上的逐字段报文；不要背，写生产客户端时以当时官方规范页为准。
- 把自写服务端接进 Cursor / Claude Code / Codex：属于模块验收，跨后面步骤，这一小节不假装已经做完。
- `@modelcontextprotocol/node` 与 koa 的具体接法：等 SDK 装上、写 step 时对着类型再钉，不在笔记里编一份假 API。

## §5.4 目标 ↔ 代码整合打钩前检查

跑打钩前检查日期：2026-09-18（首次写出 step-1 + step-2-mcp-server + step-2-mcp-client；**以下证据按当下已锁定的 step**）

「本条要能讲清」：知道生产形态为什么不是 stdio

### §5.4.A 目标 → 代码覆盖

| 目标点 | 状态 | 证据 |
| --- | --- | --- |
| A1 本 Demo 有 Node MCP 服务端，三种原语都能被本 Demo 的客户端调到 | 已实现 | step-1 `lib/mcp-server/server.ts` 注册 `make_latte` (Tool) + `menu://today` (Resource)；step-2 两个 demo 的 `mcp-http-server.ts` 同款（Prompt 留到 step-2 后半或 step-3） |
| A2 能对照 stdio 与 Streamable HTTP：同一份 JSON-RPC，管子不同 | 已实现 | step-1 stdio 子进程 vs step-2-mcp-client HTTP POST；两者 MCP 方法名都是 `tools/list` `tools/call` `resources/list` `resources/read` |
| A3 能看见 stdio 由客户端拉起子进程、随客户端结束 | 已实现 | step-1 `lib/flow/stdio-client.ts` 的 `getOrCreateClient()` 调 `new StdioClientTransport({ command: "tsx", args: [server.ts] })`；前端 Status 卡片返 `pid` + `startedAt` |
| A4 能看见 HTTP 服务端独立存活、同一端点可被多次请求打到 | 已实现 | step-2-mcp-server 在 50134 同端口 POST /mcp；多次 `/api/http/call-tool` 走 `StreamableHTTPClientTransport` 复用同一 transport，sessionId 复用 |
| A5 能看见 HTTP 无令牌 / 错令牌返回 HTTP 401 | 未实现 | 这一节没接鉴权；落 A6 + A7 时一起做（下一步 / 后续） |
| A6 能看见按用户隔离 | 未实现 | 同上 |
| A7 能讲清 OAuth 2.1 角色；实现可最简 | 未实现 | 概念卡已写在「是什么 · 管子上的身份」与易混点；代码未做 |

**A 段小结**：A1+A2+A3+A4 已实现；A5+A6+A7 未实现。这三条是模块验收「HTTP 至少做到 API 令牌 / 按用户隔离」要求，**属于这一小节需要继续 step 加深的项**，不是当前锁定时阻塞。

### §5.4.B 文档 → 代码对齐

| MD 讲点 | 代码里有没有 | 状态 |
| --- | --- | --- |
| 需求 1：官方 SDK 服务端三种原语 + 本 Demo 客户端调本地服务 | `apps/12-MCP/02-stdio-vs-Streamable-HTTP-step-1/lib/mcp-server/server.ts` + `apps/12-MCP/02-stdio-vs-Streamable-HTTP-step-2-mcp-client/lib/flow/mcp-http-client.ts` | 已实现（Tool + Resource；Prompt 留待） |
| stdio 子进程 + stdin/stdout | step-1 `lib/flow/stdio-client.ts` 用 `StdioClientTransport`；子进程 `lib/mcp-server/server.ts` 用 `StdioServerTransport` | 已实现 |
| Streamable HTTP 单端点 POST | step-2-mcp-server `lib/flow/mcp-http-server.ts` 用 `NodeStreamableHTTPServerTransport`；step-2-mcp-client `lib/flow/mcp-http-client.ts` 用 `StreamableHTTPClientTransport` | 已实现 |
| 换管子方法名不变，两侧独立请求 | step-1 `routes/stdio-*.ts` 与 step-2-mcp-client `routes/http-*.ts` 各打各的 URL | 已实现 |
| 过时 HTTP+SSE 不要当现行（注解） | 没专门做对照 demo；写在「是什么 · Streamable HTTP 数据怎么走」末段 | 已覆盖（注解） |
| 无令牌 HTTP 401 vs JSON-RPC 业务错 | 无 | 未实现（落 A5 时一起） |
| API 令牌 ≠ 按用户隔离；上帝令牌反例 | 无 | 未实现（落 A6 时一起） |
| OAuth 2.1 角色图 / 受众 | 无 | 未实现（落 A7 时一起） |
| 云上 Agent 不能 spawn 员工本机子进程 | step-1 「核心教学点」卡片 + 「为什么」段对照说明 | 已覆盖（解释） |

**B 段小结**：与 A 段对应。stdio / HTTP / 反向耦合 全部已在 step-1 + step-2 三个 demo 里实证；鉴权 / 用户隔离 / OAuth 是后续 step 的活。

### 后续 step 计划（不在本节锁定阻塞）

| 缺口 | 计划放哪 |
| --- | --- |
| A5 + 鉴权对比（无令牌 401 vs 错令牌 401 vs 对令牌放行） | step-2 后半：API Token 鉴权（同 demo 加 endpoint 校验 + 错误演示） |
| A6 + 上帝令牌反例 | step-3：按用户隔离（每个请求带 userId；同 Tool 返回按 user 过滤） |
| A7 + OAuth 角色图 | step-3 后或 step-4：OAuth 2.1 概念卡 + 受众校验形状 |
