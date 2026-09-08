# **Tool Gateway / 幂等**：请求 ≠ 执行；有副作用的 Tool 必须可重试

> 对应模块：[模块 05 · Tool Calling / Function Calling ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 4 条
> **来源**：本对话（coach start 详解 + 增量沉淀 · 2026-09-08 · 首次沉淀 · Gateway / 幂等 / 委托授权 三核心对象 + 错误回传配套；增量：错误捕获归属 + 两段字段约定 + 三层分工 + 整圈协议都是契约（description / retryable 同类约束）+ 改输入 = 流程没死 + 改输入能成）
> **状态**：已沉淀（增量更新 · 2026-09-08）
> **Demo**：可运行（产出预告已判定）—— step-N 待建；详见 [Demo 子节进度](#demo-子节进度)

上一节 [Tool Choice](./03-Tool-Choice.md) 管的是「模型这一轮**能不能产出** tool_call」（上游策略旋钮）。  
本节接的是**下游那根闸**：模型已经发请求了，你的后端**到底敢不敢执行**——以及执行之后，重试 / 网络抖动 / 用户重复点按钮，会不会把业务做错两次。

人话：Choice = 点菜规则；Gateway = 厨房**接单前**再核一遍（验钞 / 看额度 / 危险菜要签字）；幂等 = 同一桌同一道菜做三次，**还是只上一份**；委托授权 = 管家**拿你的钥匙**开你的信箱，不是管家有把万能钥匙。

---

### 是什么

Tool Calling 一圈（model → tool_call → execute → tool_result → model）在 [01 Function Calling 协议](./01-Function-Calling-协议.md) 已经画过。本条在「**execute**」这个箭头中间**插一刀**，并把「执行后的副作用」也讲清。三个核心对象 + 一个配套：

#### ① Tool Gateway（请求 ≠ 执行）

**位置**：解析 tool_call → 执行 Tool 之间的钩子层。  
**干什么**：模型说「调 X」**不等于**你可以调 X。Gateway 是一组**钩子**，按顺序检查：

| # | 钩子 | 干什么 | 失败怎么回 |
|---|------|--------|------------|
| 1 | 参数二次校验 | Zod 之外的业务约束（金额 > 0、user_id 是当前用户下级、order_id 是数字） | `tool_result: {status:"error", code:"INVALID_PARAM", msg:...}` |
| 2 | 鉴权（auth） | 调用者有没有这个 Tool 的 scope？user_id 跟会话身份对不对得上？ | `code:"FORBIDDEN"` |
| 3 | 配额 / 限流（quota / rate） | 用户级 / Tool 级 / 并发上限 | `code:"RATE_LIMITED"` 带 retry_after |
| 4 | 危险操作（danger） | 删数据 / 扣款 / 群发 / 不可逆 → 强制走**二次确认**或 dry-run | `code:"NEEDS_CONFIRM"`，前端弹确认 → 用户点头 → 再调一次 |
| 5 | 执行 | 钩子全过才允许打 Tool 真实实现 | — |

**关键一句**：Gateway 不是「安全部门 KPI」，是「你**承认模型会幻觉**之后的工程补救」。模型在 02 描述好、03 Choice 钉死，**仍可能**调错 Tool / 编造参数 / 多次调同一个。所以**真正能不能打**这层钩子说了算。

#### ② 幂等性（idempotency）

**定义**：对**同一组输入**，执行任意次，**业务结果与执行 1 次一致**。  
**不是**「重复执行没报错」——重复执行成功但金额变成 2 倍，那叫「重复执行了」，**不是**幂等。

工程上两种落法：

| 方式 | 怎么落 | 适合 |
|------|--------|------|
| **客户端传 Idempotency-Key** | 调方生成 UUID，放 header 或参数；Tool 内部 `cache.set(key, result)`；同 key 重放直接返缓存 | Stripe / 网关收款、创建订单 |
| **服务端去重（自然幂等）** | Tool 设计成「按业务键 upsert」——同一 order_id 多次调，结果不变 | 改状态、置标记、记录日志 |

**最常踩的死坑**：Tool 名叫 `create_order`，但实现里**没检查订单号是否已存在**——重试就下两单。**改名叫** `upsert_order_by_request_id` 才是对的设计。

**两个容易混的精确表述**（本轮追问沉淀）：
- **「业务结果恒等」≠「调用次数=1」**：技术上可能被调多次（cache miss 时还是会写 DB），对外可观察的副作用 = 第一次那一次。「重复执行没报错」也 ≠ 幂等——没幂等的 3 次调用都 200，但 DB 多了 2 行、钱扣了 3 次。
- **ID 是「意图指纹」不是「请求指纹」**：客户端生成 UUID v4；**同一意图**（同一购物车同一秒连按两次按钮）= 同 ID；**不同意图**（修改购物车后再按）= 不同 ID。服务端无法识别「这两次调用是不是同一个意图」，所以必须客户端生成。

#### ③ 用户委托授权（delegated auth / OAuth）

**位置**：Gateway 里鉴权那一格更细的一层。  
**场景**：Agent 调 Gmail / Calendar / GitHub / 飞书 / 企微等**第三方 SaaS**。  
**核心**：这些 API 必须**用该用户自己的 OAuth Token**——Agent 平台只能存**「刷新 Token 的能力」**，不能存**「能代表任意用户调接口的 Key」**。

反模式（禁止）：平台申请一个上帝 OAuth Client → 用 refresh_token 给所有用户代发邮件 → 用户 A 能读用户 B 的邮件 → **安全事故 + 法务事故**。  
正路：每个用户在 onboarding 时走一次 OAuth 同意页 → Agent 后端存 user_id → refresh_token → scope 限定（`gmail.readonly` / `gmail.send` 等）。

**Token 类型与生命周期**（本轮追问沉淀）：

| Token | 有效期 | 谁存 | 用途 |
| ----- | ------ | ---- | ---- |
| OAuth 同意页 | 一次性 | 用户自己点 Allow | 拿授权 code |
| **refresh_token** | 几个月到 1 年 | Agent 后端加密存 DB | 长期「刷新 Token 的能力」 |
| **access_token** | **~1 小时** | 不存，每次现换 | HTTP 请求带的短期凭证 |

Agent 调 Tool 的真实链路：

```text
handler 拿 ctx.actor.userId
  → oauth_tokens[userId] 拿 refresh_token     ← 加密存的
  → 用 refresh_token 换 access_token          ← 短期 1 小时，不存
  → 调 Gmail API（带 access_token + scope）
  → 拿 userId 对应的资源                      ← Gmail 服务端按 token 强制隔离
```

**scope 绑定 + 最小权限**：

| 原则 | 说明 |
| ---- | ---- |
| **scope 跟 refresh_token 绑死** | 同样 alice 的 refresh_token，scope `gmail.readonly` 只能读；scope `gmail.send` 才能发 |
| **最小权限原则** | onboarding 只申请业务最需要的 scope；少漏洞 + 用户更愿意点 Allow |
| **用户可随时撤销** | alice 在 Google 账户「第三方应用」里取消 Cursor 授权 → `oauth_tokens["alice"]` 作废 → 调 API 返 401 → 提示重新 onboarding |

**资源隔离在 OAuth 服务端，不在 Agent 这边**：

alice token 拉到的「alice 的 5 封邮件」——**不是 Agent 后端按 userId 过滤的，是 Gmail 服务端按 access_token 强制返回该用户的资源**。即使 Agent 改代码说「我想拿 bob 的」，Gmail 服务端也会拒——**OAuth 架构上不允许**一个 token 假装成所有用户。这就是为什么「平台上帝 Key」模式**架构上不可能存在**——平台一个 refresh_token 换的 access_token 是「平台自己的身份」，不是任何用户。

**真实 OAuth 流程（授权码模式 Authorization Code Grant · 生产版）**：

```text
① 用户点「连接 Gmail」→ 后端跳 Google OAuth 同意页：
   GET https://accounts.google.com/o/oauth2/v2/auth?
       client_id=CURSOR_CLIENT_ID
       &redirect_uri=https://cursor.sh/oauth/callback
       &scope=https://www.googleapis.com/auth/gmail.readonly  ← scope 在这一步
       &state=random_nonce                                     ← 防 CSRF
       &access_type=offline                                    ← 关键：要 refresh_token

② Google 展示同意页 → 用户点 Allow
   → Google 重定向 callback：?code=AUTH_CODE&state=random_nonce

③ 后端拿 code 换 token：
   POST https://oauth2.googleapis.com/token { code, client_id, client_secret }
   → 返 { access_token: "ya29.xxx", refresh_token: "1//xxx", expires_in: 3600 }

④ 后端存 refresh_token：
   db.save("alice", { refresh: "1//xxx", scope: ["gmail.readonly"] })   ← 生产版
   // step-3 demo 是 oauthTokens.set("alice", {...})                   ← demo 版
```

step-3 demo 是这套流程的**接口形状 mock**——`oauthTokens.set("alice", ...)` 就是生产 `db.save()` 的简化版，handler 拿 userId → 查 token → 调 API 的链路跟生产一致。

#### ④ 配套 · 错误回传（Tool 失败 ≠ 整轮崩）

**位置**：handler 内部 + Registry 中间件 + chat.ts 协议适配。
**干什么**：Tool 业务错误塞进 `tool_result`（`{status:"error", code, message, retryable}`）→ 模型能读 → 下轮改输入。**不抛异常**到 koa 顶层 → 不返回 HTTP 500 → 不挂整轮 agent。

**关键一句**：业务错误（参数错 / 找不到资源 / 权限不够）和基础设施错误（DB 断 / 网络挂）是两回事——前者**必须**结构化回传模型；后者**可以**抛异常走熔断 / 重试。

**本质**：工具和模型的整个交互 = **两段字段约定（契约）**，仅此而已。模型不"理解"错误 —— 它只读字段；工具不"理解"模型 —— 它只按 schema 收、按 schema 返。

| 段 | 契约字段 | 谁定义 | 谁对账 |
| ---- | --------- | ------ | ------ |
| **入参契约** | `tools_schema`（name / description / input_schema） | chat.ts 序列化给 LLM | Registry 用 Zod `safeParse` 对账 |
| **出参契约** | `tool_result.content`（JSON：`{result}` 或 `{error, code, retryable}`）+ `is_error`（协议字段） | Registry/chat.ts 出 | 模型读字段决策 |

**三层分工**（step-4 `divide` 完整链路）：

| 层 | 在哪 | 干什么 | 不该干什么 |
| --- | ---- | ------ | ---------- |
| **1. handler** | `lib/tools/divide.ts` | 识别业务错误 → `throw new Error("divide by zero")` | 不该懂协议层（Anthropic / Zod / Registry 概念）|
| **2. Registry 中间件** | `lib/tools/registry.ts` try/catch | 捕获原始 Error → 从 message 推断 `code` / `retryable` → 包装 `ExecResult {ok:false, code, retryable}` | 不该懂协议字段（`is_error` / `tool_use_id`）|
| **3. chat.ts 协议适配** | `routes/chat.ts` toolResultBlocks | 把 ExecResult → Anthropic `tool_result` 块 + `is_error:true` → 回灌 Round 2 | 不该懂业务（不重判 code）|
| **4. 模型决策** | 协议 B 第二轮 | 读字段（`code=DIVIDE_BY_ZERO` / `retryable=true`）→ 改 `b` 重发 `tool_use` | 不该接异常 / 不该 try/catch 工具执行 |

**为什么这么分层**：handler 抛语义错（不懂协议）→ Registry 翻译成模型能读的元数据（不懂协议字段）→ chat.ts 做协议适配（不懂业务）→ 模型决策（读字段）。每一层只懂自己的事，合起来才是「业务错误 ≠ 整轮崩」。如果让模型去 try/catch 工具执行，模型就被卷进基础设施错误 —— 边界就破了。

**拓展 · 整圈 Tool Calling 协议都是契约，不止错误回传这一刀**

错误回传只是 Tool Calling 协议的**一格**。把视角推上去：`description` / `schema` / `tool_choice` / `is_error` / `code` / `retryable` / `stop_reason` 全是**同一种东西**——都是 **JSON 字段 → 模型读 → 决策** 的契约字段。模型不变，只改字段，行为就变。**整圈没有一处是超字段之外的东西**。

| 字段 | 在哪 | 约束的是 | 模型读完之后干什么 |
| --- | --- | --- | --- |
| **`description`** | tools_schema（入参侧） | **何时调用 / 怎么填** | 决定这一轮要不要发 tool_use、调哪个 |
| **`schema` / `input_schema`** | tools_schema（入参侧） | **参数长什么样** | 决定 `tool_use.input` 里写啥 |
| **`tool_choice`** | 请求级（[03 Tool Choice](./03-Tool-Choice.md)） | **这一轮要不要强制 tool_use** | 决定 auto / required / none |
| **`tool_result.content`** | 出参侧 | **结果数据** | 决定下一轮自然语言怎么写 |
| **`is_error`** | 出参侧（协议字段） | **这一轮成不成** | 决定要不要走"修复路径" |
| **`code`** | 出参侧（业务字段） | **错是哪类** | 决定怎么跟用户解释 |
| **`retryable`** | 出参侧（业务字段） | **下一步怎么走** | 决定改输入 / 告诉用户 / 换工具 |
| **`stop_reason`** | 协议级 | **为什么停** | 决定要不要继续 Round 2 |

**Tool Calling 调试 = 字段对账**。所有"模型乱调 / 不调 / 调错参 / 错后乱走"的问题，查的都是字段：

- `description` 写得不清？→ 模型不知道何时调（改 description）
- `schema` 写得不对？→ 模型填错参（改 schema 或 Zod）
- `is_error` 没说清？→ 模型不知道错了（改 Registry 包装）
- `code` 没说对？→ 模型不知道错是哪类（改 code 推断）
- `retryable` 没标对？→ 模型不知道改不改输入（改 Registry 的 retryable 推断）

> 备注：上面「入参契约 / 出参契约」两张表（紧接"三层分工"前的两张）保留 —— 它们是 step-4 `divide` 错误回传那一刀的精确刻画；本表是更上层的视角，覆盖整个 Tool Calling 协议。

---

### 为什么（Agent 开发要懂）

| 不懂的后果 | 具体会怎样 | 修法 |
|------------|------------|------|
| 没有 Gateway | 模型幻觉出 `delete_user({user_id:0})` → 真删 → 业务事故 | Gateway 钩子：self-delete 拒绝 / 管理员 scope 检查 |
| 没有危险操作二次确认 | Agent 帮用户「清理过期邮件」→ 调 `delete_all_emails` 把所有邮件都删了 | Gateway 危险操作 → `NEEDS_CONFIRM` → 前端弹二次确认 |
| 没有幂等 + 网络抖动 | 客户端超时重试 → 下两单 / 多扣一次钱 | `Idempotency-Key` + 服务端 cache 命中返同结果 |
| 没有幂等 + 模型并发 | 模型一次返回 2 个相同 `create_order` tool_call → 下两单 | 同 key 幂等 cache + ON CONFLICT |
| 没有幂等 + 二次确认 UI | 用户点 2 次「确认」按钮 → 二次确认执行两次 | Tool handler 内部幂等检查（第二次 cache 命中返同结果） |
| 用上帝 OAuth Key | 一个用户数据被另一个用户读到；agent 平台被 Google 吊销整个 client_id | per-user OAuth + scope 限定 |
| 错误直接抛异常 | 整轮 agent 崩 → 用户看到 500 → 不知道是 Tool 错了还是网络错了 | 错误结构化回传 tool_result → 模型看到 → 下轮改 |

前端类比：Gateway ≈ axios 拦截器里的 `before` 钩子（鉴权 + 限流 + 业务校验），幂等 ≈ 表单提交按钮 disabled 防双击，委托授权 ≈ 每张订单走对应用户的支付渠道而不是平台垫付。

---

### 易混点

| 易混 | 差在哪 | 判错会怎样 |
|------|--------|------------|
| **Gateway vs Tool Choice** | Choice = 上游「模型要不要产出 tool_call」；Gateway = 下游「后端要不要执行」 | 该 Gateway 兜的你让 Choice 兜，模型仍可能产出非法 tool_call → 没人拦 |
| **幂等 vs「执行前先查 DB」** | 「执行前查」是 Tool **外**的补救，仍会因并发重复失败；幂等是 Tool **内**的设计，写一次就对 | 用「执行前查」防重 → 两个请求同时查都「不存在」→ 两个都插入 → 重复 |
| **鉴权 vs 授权（auth vs authz）** | 鉴权 = 你是谁（who are you）；授权 = 你能干什么（what can you do） | 只鉴权不授权 → 任何人登录就能调删库 Tool |
| **限流 vs 配额** | 限流 = 单位时间频次（每分钟 60 次）；配额 = 总量上限（每月 1 万次） | 用限流当配额 → 用户慢用一个月也撞线 |
| **危险操作 vs 鉴权失败** | 鉴权失败 = 永远不让调；危险操作 = 这次别调，**确认完再调** | 危险操作按鉴权失败处理 → 用户永远删不了自己的草稿 |
| **委托授权 vs 平台 Key** | 委托授权带**用户身份**和**有限 scope**；平台 Key 是固定权限、隔离不到用户 | 所有用户共享上帝 Key → 数据串号 + 平台被吊销 |
| **refresh_token vs access_token** | refresh_token 是长期的（几个月到 1 年，存 DB）；access_token 是短期的（~1 小时，每次现换不存） | refresh_token 当 access_token 用 → 长期 token 泄露风险放大；access_token 存 DB → 短期 token 占用 + 过期后失效 |
| **scope 绑定 vs userId 绑定** | refresh_token 同时绑 userId + scope；scope 决定能干什么 | onboarding 时申请过大 scope（如 `gmail.modify` 而不是 `gmail.readonly`）→ 漏洞多 + 用户更不愿点 Allow |
| **错误回传 vs 抛异常** | 错误回传 = 把 Tool 业务错误塞进 `tool_result` → 模型能读 → 下轮改；抛异常 = 后端崩 → 整轮挂 | 写 Tool 不写 try/catch → 一个 Tool 错所有轮死 |
| **工具捕获 vs Registry 捕获** | handler 只 throw 不 catch；捕获 + 翻译 = Registry 中间件的活 | 让 handler 自己 try/catch → 业务错误散在每个 Tool 里，协议层和业务层耦合，改协议要改每个 Tool |
| **理解错误 vs 读字段** | 模型读 tool_result 块的 `code` / `retryable` / `is_error` 字段决策 —— 不是"接异常 / 处理异常" | 把模型想成 try/catch 工具执行 → 模型被卷进基础设施错误 + `retryable` 语义失效 |
| **「重复执行无害」≠「幂等」** | 无害 = 没出大事（但可能数据已增 1 变 2）；幂等 = 结果恒等 | 「重复了也没事」就不加幂等 → 静默多扣钱 |
| **幂等 vs 限流 vs 防抖** | 幂等 = 后端 Tool 同 ID 重放结果恒等；限流 = Gateway 拒绝频率（每分钟上限）；防抖 = 前端 UI 按钮 disabled 防连点 | 限流**拒绝**重复（429），幂等**接受**重复（返同结果）；防抖救不了网络重试/并发，幂等才是后端兜底——三者正交、互相补足，**不是替代** |

---

### 例子

#### 变体 1 · `delete_user` Tool：Gateway 三钩子 + 危险操作二次确认

**生活**：你让管家帮你扔垃圾，管家**不会**因为你说「扔」就真的下楼扔——他会先问：是哪袋？确定吗？家里还有人要留吗？——这些问完才动手。

**前端 · `delete_user` Tool**：

```text
模型 tool_call: delete_user({user_id: 42, reason: "测试账号"})
            ↓ Gateway 钩子：
1. 参数校验  user_id 是数字 ✓；reason 必填 ✓
2. 鉴权      当前 actor 是 admin scope ✓（否则 FORBIDDEN）
3. 配额      本月 delete 配额 5/5 已用 → RATE_LIMITED 拒
4. 危险操作  delete_user 是不可逆 → 返回 NEEDS_CONFIRM
            ↓
tool_result: {status:"need_confirm", preview:"将永久删除 42 号用户及其 200 条记录"}
            ↓
前端弹出二次确认 UI：「确定吗？」 → 用户点「确定」
            ↓
前端再发起一次调用：delete_user({user_id:42, confirm_token:"..."})
            ↓ Gateway 二次确认通过 → 执行
```

数据怎么走：**模型说调 ≠ 执行**。Gateway 拒掉 ≠ 错误——是**业务规则要求再确认**；前端拿到 `NEEDS_CONFIRM` 弹 UI，**用户点头**才是新的 tool_call，这次 Gateway 才放行。

#### 变体 2 · `create_order` Tool：幂等 key 防双下单

**生活**：网购点「提交订单」按钮，**按一次**和**按三次**应该都只下一个单——浏览器网络抖动 / 你手抖 / 重试，都不应该变两单。

**前端 · `create_order` Tool**：

```ts
// Tool 入参（带幂等 key）
{ user_id, items: [...], idempotency_key: "uuid-v4" }

// Tool 内部实现（伪代码）
async function createOrder(input) {
  const cached = await cache.get(input.idempotency_key)
  if (cached) return cached                  // 重放：返上次结果（不是再插一行）
  const order = await db.insertOrder(input)  // INSERT ... ON CONFLICT DO NOTHING
  await cache.set(input.idempotency_key, order, ttl: 24*3600)
  return order
}
```

**为什么 key 要客户端生成**：因为「同一意图」只能由发起方识别——同一用户同一购物车同一秒按两次按钮，**意图**是同一个，key 应该是同一个；两次的意图如果不同（修改购物车后第二次按），key 就应该不同。

#### 变体 3 · `read_recent_emails` Tool：用户委托授权

**生活**：管家帮你拿信，**用你给的钥匙**开你的信箱——不是管家自己有一把万能钥匙能开**所有**信箱。

**前端 · `read_recent_emails` Tool**：

```text
模型 tool_call: read_recent_emails({user_id:"alice", max:5})
            ↓ Gateway 钩子：
1. 参数      user_id 必须是当前会话 user ✓
2. 鉴权      当前 actor 跟 user_id 一致 ✓（否则 FORBIDDEN，不能读别人的邮件）
3. 委托授权  查 oauth_tokens 表取 alice 的 gmail.readonly refresh_token
            → 用它换 access_token → 调 Gmail API
4. 配额      读邮件每月 10000 次未超
5. 执行      调 Gmail API 拿 alice 自己的 5 封邮件
            ↓
tool_result: {status:"ok", emails:[...]}
```

**反例**：平台有一个 Gmail OAuth client 用平台自己的 refresh_token → 给任意用户调 → bob 拉到了 alice 的邮件 → **事故**。委托授权的正确做法是「每个 user 自己授权 + scope 限定 + 资源 = 该用户自己的」。

#### 变体 4 · 配套 · Tool 抛错 → 结构化 tool_result

**生活**：点外卖「已售罄」不是 App 崩——App 把「这道菜卖完了」展示出来，你可以**换一道**或**改主意**。

**前端 · 任意 Tool**：

```ts
// 错的 Tool
async function getOrderStatus(orderId) {
  const r = await db.query("SELECT ... FROM orders WHERE id=?", orderId)
  if (!r) throw new Error("order not found")   // ❌ 抛异常
  return r
}

// 对的 Tool
async function getOrderStatus(orderId) {
  const r = await db.query("SELECT ... FROM orders WHERE id=?", orderId)
  if (!r) return {
    status: "error",
    code: "ORDER_NOT_FOUND",
    message: `订单 ${orderId} 不存在，请让用户确认单号`,
    retryable: false,
  }                                           // ✓ 结构化错误
  return { status: "ok", order: r }
}
```

**数据怎么走（4 层精确链路 · step-4 `divide`）**：

```text
divide.handler({a:10, b:0})
  ↓ throw new Error("divide by zero")                              ← ① handler 只抛语义错
registry.executeTool try/catch 捕获                                ← ② Registry 翻译
  → { ok:false, code:"DIVIDE_BY_ZERO", retryable:true, ... }        ← 元数据给模型看
chat.ts 转 Anthropic tool_result 块                                ← ③ 协议适配
  → { type:"tool_result", tool_use_id, content:'{"error":"...","code":"DIVIDE_BY_ZERO","retryable":true}', is_error:true }
Round 2 模型读字段                                                 ← ④ 模型决策
  → 改 b=2 重发 tool_use: divide({a:10, b:2}) → tool_result: {ok:true, result:5}
```

**反例（不这么走会怎样）**：Tool handler 不结构化 → 直接抛到 koa 顶层 → koa 返 HTTP 500 → 整轮 agent 崩 → 用户看到「出错了请重试」。**业务继续** vs **整轮崩** —— 差在这一刀。

---

### 需求清单（每个变体 1 条 · 验收准绳）

> 清单用于 `coach complete` 时对；**不是**一次落 Demo 就全做完。step 仍按知识动态推进。

| # | 业务场景 | 目标 | 涉及变体 | 验收标准（可观察） |
|---|----------|------|----------|-------------------|
| 1 | **删用户 Tool** | 不可逆操作必须过 Gateway + 二次确认 | Gateway · 危险操作 | 调 `delete_user` → Gateway 钩子按顺序打印鉴权 / 配额 / 危险 三档判定；缺 confirm_token 时返 `NEEDS_CONFIRM`，**不执行**；带 confirm_token 时执行 |
| 2 | **下订单 Tool**（有副作用） | 网络抖动 / 重复点按钮 = 同一结果 | 幂等性 | 同一 `idempotency_key` 调 3 次：DB 只插 1 行 + 后两次返**与第一次完全相同**的 order 对象 + 缓存命中日志可见 |
| 3 | **拉邮件 Tool** | 用户 A 拉不到用户 B 的邮件 | 用户委托授权 | 模拟两个 user：`alice` token 调 Gmail Tool → 只能拉 alice 资源；用 platform 上帝 Key 兜底 → 启动期就**拒启动**（fail-closed） |
| 4 | **任意 Tool 抛错** | Tool 业务错误 = tool_result，不是 HTTP 500 | 错误回传 | Tool 内部抛异常 → koa 中间件捕获 → 返回结构化 tool_result `{status:"error",code,message,retryable}` → 模型下轮能基于此改输入 |
| 5 | **限流撞线** | Tool 配额耗尽 = 友好提示，不崩 | 配额 / 边界 | 用户配额打满后调 Tool → 返 `RATE_LIMITED` + retry_after；模型读到能告诉用户「今天调满了」 |

---

### 取舍

| 场景 | 更倾向 | 为什么 |
|------|--------|--------|
| 不可逆 / 扣款 / 删数据 | Gateway 危险操作钩子 + 二次确认 | 模型幻觉一次就出大事 |
| 创建 / 写日志 / 改状态 | 幂等 key + 服务端去重 | 重试成本几乎 0，但不能双写 |
| 第三方 SaaS 调用 | per-user OAuth + scope 限定 | 合规底线 |
| 只读 / 计算类 Tool（calculator / get_weather） | Gateway 鉴权过即可，**不需幂等不需二次确认** | 没副作用 + 重复无害 |
| Tool 业务错误 | 结构化 tool_result | 模型能学到下轮怎么改 |
| Tool 基础设施错误（DB 断 / 网络挂） | 抛异常 + 重试 + 熔断 | 业务错误和基础设施错误要分清 |
| 限流 | 软限流（友好 RATE_LIMITED 提示） > 硬拒（直接 429） | Agent 可以让模型改策略，用户可以等 |

---

### 踩坑

| 坑 | 症状 | 修法 |
|----|------|------|
| Tool 直接调真实 API，没 Gateway | 一次幻觉出大事故 | Gateway 钩子是强制基建，不是可选 |
| `create_order` 不查重 → 重试双下单 | 用户投诉扣两次钱 | `idempotency_key` + ON CONFLICT |
| 平台 OAuth client 代理所有用户 | Google 吊销整个 client + 法务事故 | per-user OAuth + fail-closed |
| Tool 抛异常 → 整轮 500 | 用户重试三次都失败 | Tool 包 try/catch → 结构化错误回传 |
| 危险 Tool 当普通 Tool 注册 | 「帮我清理邮箱」真删完 | 危险 Tool 走 Gateway 危险钩子 |
| 限流撞线返 502「系统异常」 | 用户骂产品 | `RATE_LIMITED` + retry_after + 模型能读 |
| 把业务错误和基础设施错误混一起 try/catch | 网络抖一下，业务错误也被吞 → 用户不知道为什么失败 | 分层：Tool 内部业务错结构化返回；外层 koa 才兜基础设施异常 |

---

### 过关自检

对照「本条要能讲清」：知道执行前要鉴权 / 校验

1. 用自己的话画 **Tool Gateway**：从模型发出 `tool_call` 到 Tool 真执行的中间，钩子按什么顺序干了几件什么事？
2. 为什么「模型请求了 ≠ 可以执行」？举一个 Gateway 该拦却没拦会出事的具体场景。
3. 「幂等」的定义是什么？为什么「重复执行没报错」≠ 幂等？举一个**看起来幂等实际不是**的例子。
4. 「用户委托授权」跟「平台 API Key」差在哪？为什么 SaaS 化 Agent 不能用上帝 Key？
5. Tool 抛异常跟 Tool 返回结构化错误，**对 Agent 整轮行为的影响**差在哪？
6. 危险操作和鉴权失败处理上的差别是什么？为什么不能合并？

---

### 我追问过的（本轮 2026-09-08 沉淀）

> 按 [07-notes §2.1](05-demo.md#21-沉追问的筛选--提炼) 三栏格式：问题 / 针对什么 / 回答。新理解已并入「是什么 ②」「为什么」「易混点」节。

| 问题 | 针对什么 | 回答 |
| ---- | -------- | ---- |
| 变体 2 · 代码里幂等是怎么实现的 | 看 step-2 [create-order.ts](../../apps/05-Tool-Calling/04-Tool-Gateway-幂等-step-2/lib/tools/create-order.ts) 后想确认机制 | 内存 `Map` 两张：`ordersDb`（伪 DB）+ `idempotencyCache`（key → 上次 result + expiresAt，TTL=24h）。handler 三步：① 查 cache（命中 + 未过期 → 返 cached.result + cacheHit=true，**不插 DB**）② 没命中写 `ordersDb.set(orderId, order)` + `cache.set(key, { result, expiresAt: now+24h })` → 返 `dbInserted=true`。演示对照：call_1 dbInserted / call_2,3 cacheHit · `db_orders_count=1`。生产要换 Redis + DB 唯一索引 + `ON CONFLICT` 才能扛进程崩 / 并发 / 跨节点 |
| 变体 2 · 添加幂等的原因是什么 | 想确认「为什么不让 Tool 简单重试就好」 | 3 类场景：① 网络抖动 / 客户端超时重试（公网基本事实：5G 抖动 + 中间代理 + 客户端崩溃重连 = 单次 99% × 100 次 = 60% 成功率）② 模型并发同意图 tool_call（变体 2 真测过：同 key 调 3 次 DB 只插 1 行）③ 二次确认 UI 用户点 2 次（手抖 / UI disabled 失灵）。关键区分：「重复执行没报错」**不等于**「幂等」——没幂等的 3 次调用都 200，但 DB 多了 2 行、钱扣了 3 次。幂等不是 UX 补丁，是**公网可靠的后端兜底** |
| 变体 2 · 跟限流 / 防抖不是一样吗 | 看到 create_order 既有 quota 钩子又有 idempotency_cache，以为是一回事 | 不是。三者解决不同问题：**限流** = 频率（每分钟 > 60 次返 429，拒绝重复）；**防抖** = UI（按钮 disabled / setTimeout，只发 1 次）；**幂等** = 重复（同 ID 重放结果恒等，接受重复）。三者正交——一个 Tool 既可以有限流也可以有幂等；防抖救不了网络重试/并发（请求已离开浏览器），幂等才是后端兜底。生活类比：限流 = 银行「每天只放 100 号」、防抖 = 取号后5 分钟内不能再取、幂等 = 同一张转账单交柜台 100 次只扣一次钱 |
| 变体 2 · ID 是「请求指纹」还是「意图指纹」 | 看到"每次请求生成 ID"想确认粒 | ID 是**意图指纹**不是请求指纹。客户端生成 UUID v4；同一意图（同一购物车同一秒连按两次按钮 / 客户端超时重试同一笔转账单 / 模型并发同意图）= 同 ID；不同意图（修改购物车后再按 / 不同用户 / 跨订单）= 不同 ID。**服务端无法识别**「这两次调用是不是同一意图」，所以必须客户端生成 |
| 变体 2 ·「最终只调用一次」措辞对吗 | 看到「不管异步同步最终只调用一次」想确认表述 | 措辞要修正：「业务结果恒等」**不等于**「调用次数=1」。技术上可能被调多次（cache miss 时还是会写 DB + cache.set），对外可观察的副作用 = 第一次那一次。外部看：DB 1 行 / 钱扣 1 次 / 通知发 1 条 = 形态等同只调一次。措辞要改成「业务上等同只调一次」，不要说「调用次数=1」 |
| 变体 3 · step-3 主要加什么功能 / 真实场景在解决什么 | 想理解 Gateway 「请求 ≠ 执行」第三条腿 | 让 Agent 调第三方 SaaS（Gmail / GitHub / Calendar / 飞书 / 企微）时**用用户自己的 OAuth Token**，**不能用平台上帝 Key**。3 类真实场景：① AI IDE 帮你 commit GitHub PR（Cursor / Continue 用你的 token 提交，PR 上 author 是你的名字）② AI 助手读邮件（Cursor / Notion AI 用你的 Gmail token 只读你的邮件）③ 企业 SaaS 集成（员工各 onboard 一次，Agent 用员工 token 读自己的群消息）。没委托授权的代价：平台用上帝 Key 代读 → Bob 拉到 alice 邮件 + Google 吊销 client_id + 平台倒闭 |
| 变体 3 · step-3 在代码里体现在哪里 | 想看委托授权的具体行号 | [apps/.../04-Tool-Gateway-幂等-step-3/lib/tools/read-recent-emails.ts](../../apps/05-Tool-Calling/04-Tool-Gateway-幂等-step-3/lib/tools/read-recent-emails.ts) handler 三步：① 行 67-77 fail-closed（`actor.userId === "platform-god"` → FORBIDDEN）；② 行 80-91 鉴权（`oauth_tokens.get(actorUserId)` → 没有 → FORBIDDEN）；③ 行 93-95 用 token 调 API（`mockGmailInbox[actorUserId] ?? []`）。[routes/chat.ts:115](../../apps/05-Tool-Calling/04-Tool-Gateway-幂等-step-3/routes/chat.ts) actor 透传到 handler；[routes/health.ts:21](../../apps/05-Tool-Calling/04-Tool-Gateway-幂等-step-3/routes/health.ts) 暴露 oauthUsers 面板（`["alice", "bob"]`）|
| 变体 3 · 真实设计逻辑是 OAuth 读 userId → 拿 Token → 调 API 吗 | 想确认整条链路 | 是。链路 = 用户 onboard（一次性，用户点 Allow → 后端拿 refresh_token）→ 调 Tool（handler 拿 ctx.actor.userId → oauth_tokens[userId] 拿 refresh_token → 用 refresh_token 换 access_token → 调 API）。**补两个精确点**：① refresh_token 长期（存 DB）vs access_token 短期（每次现换不存）—— Agent 后端只存 refresh_token；② **资源隔离在 OAuth 服务端不在 Agent 这边**——alice token 拉 alice 邮件是 Gmail API 服务端按 access_token 强制返回，不是 Agent 按 userId 过滤。所以**架构上**不可能有平台上帝 Key：平台一个 token 换的 access_token 是「平台自己的身份」，OAuth 服务端不允许一个 token 假装成所有用户 |
| 变体 3 · 真实 OAuth 流程长什么样 | 想看生产版 OAuth 4 步 | 授权码模式 Authorization Code Grant 4 步：① 用户点「连接 Gmail」→ 后端跳 Google OAuth 同意页（带 client_id + redirect_uri + scope + state + `access_type=offline` 要 refresh_token）；② 用户点 Allow → Google 重定向 callback 带 code；③ 后端拿 code 换 token（POST oauth2.googleapis.com/token → 返 access_token + refresh_token + expires_in）；④ 后端存 refresh_token（生产 `db.save("alice", { refresh, scope })` · step-3 demo 是 `oauthTokens.set("alice", {...})`）。step-3 demo 是这套流程的**接口形状 mock**——handler 拿 userId → 查 token → 调 API 链路跟生产一致 |
| 变体 4 · 错误捕获是由工具还是模型做的 | 想确认「工具里捕获错误」的归属 | **Registry 中间件**（registry.ts try/catch），不是 Tool handler，也不是模型。**精确分工**：① handler 只识别业务错误 → `throw new Error("divide by zero")`（不懂协议）；② Registry try/catch 捕获 + 从 message 推断 `code` / `retryable` + 包装成 `ExecResult {ok:false, code, retryable}`（翻译成模型能读的元数据）；③ chat.ts 把 ExecResult 转成 Anthropic `tool_result` 块 + `is_error:true` 回灌 Round 2（协议适配）；④ 模型读字段决策（读 `code=DIVIDE_BY_ZERO` / `retryable=true` → 改 `b` 重发）。**关键修正**：模型不"接异常"，只读字段 —— 它根本不知道 handler 抛过 Error，只看到 `{code, retryable}`。如果让模型 try/catch 工具执行，模型就被卷进基础设施错误，边界就破了 |
| 变体 4 · 工具跟模型的交互本质是什么 | 想提炼「工具调用」的最小抽象 | **两段字段约定（契约）**，仅此而已。**入参契约**：`tools_schema`（chat.ts 序列化给 LLM 的 name / description / input_schema）↔ Zod schema（registry.ts 的 `safeParse`）—— 模型按 schema 填 `tool_use.input`，Registry 用同一个 schema 对账；**出参契约**：`tool_result.content`（JSON 化的 `{error, code, retryable}` 或 `{result}`）+ `is_error`（Anthropic 协议字段）+ 协议 B 块结构 —— 模型读 `code` / `retryable` 字段决策。整个交互 = 两张字段表的握手，**没有别的**。模型不"理解" Tool，Tool 也不"理解"模型 —— 都是字段对账，跟两个 JSON 对象走协议一模一样 |
| 变体 4 · 改输入是什么意思 | 想确认 retryable 的语义 | **改输入 = 流程没死 + 改输入能成**。`retryable:true` =「流程还能继续，这一轮换入参就行」的元数据信号（给模型看的）。模型在 Round 2 看到这个信号 → 知道"重发个不一样的 tool_use 就行"。`retryable:false` = 改了也白搭，该告诉用户 / 换工具。**关键**：`retryable` 不是 handler 自己说的，是 [registry.ts:113-114](../../apps/05-Tool-Calling/04-Tool-Gateway-幂等-step-4/lib/tools/registry.ts) **从 Error.message 推断**的元数据 —— handler 只 throw，Registry 翻译。模型不是"必须改"，是"可以改"——也可以告诉用户 / 换工具。**对照**：`retryable:true` 的场景（b=0 DIVIDE_BY_ZERO / b="abc" INVALID_PARAM）= 改输入能成；`retryable:false` 的场景（user_id 不存在 USER_NOT_FOUND / 默认 TOOL_THREW）= 改了也白搭 |
| 变体 4 · description 跟 retryable 是同一类约束吗 | 想确认这两个字段的本质是否同类 | **是，都是契约字段**。description 约束"何时调用 / 怎么填"（入参侧）；retryable 约束"出错后下一步怎么走"（出参侧）；中间还有 `schema` / `tool_choice` / `is_error` / `code` / `stop_reason` 等。**整圈 Tool Calling 协议都是字段约定，没有一个超字段之外的东西**。Tool Calling 调试的所有问题——乱调 / 不调 / 调错参 / 错后乱走——查的都是字段，不是模型"理解力"。**模型不变，只改字段，行为就变** |

---

### 还没搞懂的

- 幂等 key 的 TTL 怎么定合适？太长 → 历史 key 残留污染；太短 → 跨窗口重试失效。Stripe 默认 24h 是工程经验，但**为什么是这个数**没在官方文档里写清楚。
- 「用户委托授权」在国内 SaaS（飞书 / 企微 / 钉钉）的实现差异：每家的 OAuth 流程、scope 颗粒度、refresh_token 失效策略都不同；本条以「概念 + Gmail 为例」，真接入再补一节各家差异。
- 「危险操作二次确认」用 confirm_token 还是用 idempotency_key 复用？两者语义不同（确认 vs 重放），不要复用。
- Gateway 钩子的并发安全性：同 actor 同 Tool 同时两次调用，鉴权 / 配额是否原子？需要乐观锁还是 DB 唯一约束，**本条未展开**——产品级并发量大时再补。
- **OAuth PKCE**（Proof Key for Code Exchange）：SPA / 移动端 public client 防 code 被截获后换 token；本条 demo 简化（client_secret 留后端）。真接入 SaaS 化移动端 Agent 必加。
- **Token 撤销检测**：alice 在 Google 账户取消 Cursor 授权 → access_token 下一次就 401 → Agent 后端要主动检测 + 清理 oauth_tokens + 让 alice 重新 onboarding。本条 demo 没做。
- **refresh_token 轮转策略**：Google OAuth 会发新的 refresh_token（rotation） + 让旧的失效；Agent 后端每次换 access_token 时要更新 DB。轮转失败 → 用户被强制重 onboard。

---

### Demo 子节进度

> 本条为「可运行」外部条。表行 = 已建 step；**N 动态**，学习者主动说「锁定」才标 ✅。

| 状态 | 子节 | 入口 | 端口 | 本子节教学点 |
|------|------|------|------|--------------|
| ✅ | step-1 | `yarn app:05-04-tool-gateway-step-1` | `50034` | 协议 B 真 LLM · delete_user Gateway 三钩子（鉴权/配额/危险）+ 二次确认（`callsModel: true`） |
| ✅ | step-2 | `yarn app:05-04-tool-gateway-step-2` | `50035` | 协议 B 真 LLM · create_order 幂等（同 idempotency_key 调 3 次 /api/chat → DB 只插 1 行 · 后两次缓存命中） |
| ✅ | step-3 | `yarn app:05-04-tool-gateway-step-3` | `50036` | 协议 B 真 LLM · read_recent_emails 委托授权（per-user OAuth + fail-closed + 未 OAuth 拒绝） |
| ✅ | step-4 | `yarn app:05-04-tool-gateway-step-4` | `50037` | 协议 B 真 LLM · divide 抛错结构化（handler throw → koa 中间件捕获 → 结构化 tool_result `{status:"error",code,message,retryable}` → Round 2 模型改输入） |
