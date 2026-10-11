# **Tool Gateway / OAuth**：执行前策略层；用户身份 ≠ 上帝 Key

> 对应模块：[模块 20 · AI Security ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 3 条
> 本条笔记已写入小节文档（`coach start` 详解后由 Coach 写入）。

- **来源**：`coach start`（本对话详解，2026-10-10）
- **状态**：已沉淀

> 各节写什么、怎么判断归哪一节、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

### 是什么

#### 上帝 Key 陷阱

**「上帝 Key（God Key）」** 是 Agent 最常见的身份错误——**用一个长期有效 + 全权限的 API Key 调所有下游 Tool**。一旦泄露或被滥用：

- **全权限失守**：攻击者拿到 Key = 拿到所有 Tool 的全部能力（退款 / 删数据 / 发邮件 / 改配置）。
- **用户身份无法隔离**：所有用户共享同一个 Key，无法区分「这是 A 用户做的 vs B 用户做的」。
- **撤销成本高**：换 Key = 所有用户掉线；不换 Key = 漏洞持续。

#### Tool Gateway 模式

**Tool Gateway** 是在 **Agent 和下游 Tool 之间插一层策略网关**——所有 Tool 调用必须经过 Gateway，由 Gateway 做：

| 网关职责 | 防什么 |
|----------|--------|
| **身份验证** | 谁在调（Agent 身份 + 用户身份） |
| **权限校验** | 这个 Agent / 用户有没有权限调这个 Tool |
| **Token 转换** | 拿用户授权换下游 Tool 专用 token |
| **审计日志** | 每次调用留痕 |
| **限流 / 配额** | 防 DoS / 防滥用 |
| **参数校验** | Tool 参数走强类型 + 范围校验 |

#### OAuth On-Behalf-Of（OBO）流

**OBO 流** 是用户身份与 Agent 身份分离的标准做法：

```
用户 ──OAuth──► Agent 拿到 user access_token
                    │
                    ▼
Agent 用 client_credentials（自己身份）+ user access_token
                    │
                    ▼
   ──► OAuth Server 换出 new down-stream token（scope 限定）
                    │
                    ▼
Agent 用新 token 调下游 Tool（Tool 看到的是用户授权 + Agent 代理）
```

**核心**：用户 token **不直接给下游**——Agent 用自己的身份 + 用户的授权去**换新 token**。

一句话：**Tool Gateway 是「在 Tool 调用前加一道策略层」；OAuth OBO 是「让用户身份和 Agent 身份正确分离」——两件事一起做 = Agent 安全的身份基础**。

### 为什么（Agent 开发要懂）

Agent 在生产里几乎一定**代用户调用下游**——这是 Agent 跟传统应用的关键差异：

- **代用户调支付**：用户授权 Agent 退款 → Agent 用什么身份调支付 API？
- **代用户发邮件**：用户授权 Agent 写信 → Agent 用什么 Token 发？
- **代用户读数据**：用户授权 Agent 看他的 CRM → Agent 拿的是用户 CRM Token 还是公司 Token？
- **多用户多租户**：100 个用户共用一个 Agent → 怎么区分谁调了什么？

具体后果（举四个最常见的）：

1. **上帝 Key 泄露**：Agent 的全权限 API Key 被印在日志里 / 提交到 Git → 攻击者拿到后给所有用户退款。
2. **用户身份混淆**：A 用户的请求被 Agent 用 B 用户的 Token 调下游 → 数据泄露。
3. **Token 长期有效**：用过的 Token 不轮换 → 一年后还能用 → 离职员工仍能访问。
4. **Token 直接转发**：Agent 把用户 access_token 直接传给下游 Tool → 用户能调的所有 Tool，Agent 也都能调 → 越权。

Agent 没有 Tool Gateway + OAuth = **身份混乱 + 权限失守**。

### 易混点

Tool Gateway / OAuth 常被和它们的「邻居机制」混淆。**判错任何一个会让身份 / 权限失守**——必须分清。

#### 用户身份 vs Agent 身份（核心区分）

| | 用户身份 | Agent 身份 |
|---|---|---|
| **代表** | 用户本人 | 你的 Agent 服务 |
| **Token 类型** | 用户 OAuth Access Token | Agent Service Token（client_credentials） |
| **用途** | 「A 用户授权了」 | 「Agent 在代表用户」 |
| **关系** | OBO 流里两者**同时**用，**不互换** | |

**判错会怎样**：把用户 token 当 Agent token 用 = 用户身份污染 Agent 审计；把 Agent token 当用户 token 用 = Agent 越权（Agent 拿到所有用户权限）。

#### OAuth Token vs API Key

| | OAuth Token | API Key |
|---|---|---|
| **有效期** | 短期（几小时到几天）+ 可刷新 | 长期（几个月到永久） |
| **权限范围** | scope 限定 | 通常全权限 |
| **撤销** | 随时撤销 | 撤销 = 换 Key（成本高） |
| **颁发** | OAuth Server 颁发 | 服务颁发 |
| **适合** | 跨服务、跨用户 | 内部服务对服务 |

**判错会怎样**：用 API Key 跑所有 Tool 调用 = 上帝 Key 陷阱；用 OAuth Token 当 API Key = 过期掉线。

#### Tool Gateway vs API Gateway

| | API Gateway（通用） | Tool Gateway（Agent 专用） |
|---|---|---|
| **做什么** | 限流 / 鉴权 / 路由 / 协议转换 | 在通用 Gateway 之上加 **Token 转换 / Scope 校验 / 用户身份传递** |
| **专门加** | — | OBO 流 / Agent 身份识别 / 审计「哪个用户让 Agent 调了什么 Tool」 |
| **关系** | Tool Gateway 通常**基于** API Gateway，但加专门层 | — |

**判错会怎样**：以为有 API Gateway 就够 → 通用 Gateway 不管「Agent 在代表谁」；Tool Gateway 是这一层。

#### OAuth 2.0 vs OAuth 2.1

| | OAuth 2.0 | OAuth 2.1 |
|---|---|---|
| **关系** | 老版本 | 2.0 的简化版（去掉了一些不安全流程） |
| **关键差异** | 多个 grant type，部分不安全 | 推荐 Authorization Code + PKCE；Implicit 弃用 |
| **MCP 推荐** | 兼容 | **推荐** |

**判错会怎样**：用 Implicit Flow（不安全）+ 没 PKCE → Token 被劫持；MCP 推荐 2.1 + PKCE。

#### Token 转发 vs OBO 流

| | Token 转发 | OBO 流 |
|---|---|---|
| **做法** | Agent 把用户 token 直接给下游 Tool | Agent 用自己的身份 + 用户授权**换新 token**给下游 |
| **下游看到的** | 用户身份（用户能调的，Agent 也能调） | 用户授权 + Agent 代理（scope 受限） |
| **安全性** | 弱（用户 token 走一圈） | 强（Agent 不能用用户 token 调任意 Tool） |

**判错会怎样**：用 Token 转发代替 OBO → 用户能调的工具，Agent 也能调 → **Agent 越权**。

### 核心概念（变体 / 分支全扫）

Tool Gateway / OAuth 有 10 个变体。

#### 1. 上帝 Key 陷阱

**表现**：Agent 用一个长期有效 + 全权限的 API Key 调所有下游 Tool。

**风险**：泄露 = 全权限失守；用户身份无法隔离；撤销成本高。

**例子**：万能管家钥匙 vs 房间钥匙——管家（Agent）不能拿酒店总钥匙（上帝 Key），只能拿今天要打扫的房间的钥匙（scope 限定的 token）。

**需求 1（上帝 Key 风险演示）**：构造「所有 Tool 共享一个 API Key」架构；模拟 Key 泄露，统计影响面。

#### 2. Tool Gateway 拦截层

**架构**：

```
Agent ──► Tool Gateway ──► Tool A
                       ──► Tool B
                       ──► Tool C
```

**Gateway 做的事**：身份验证 / 权限校验 / Token 转换 / 审计 / 限流 / 参数校验。

**例子**：公司印章 vs 业务章——公司印章（上帝 Key）能签任何合同；业务章（Tool Gateway）只能签自己业务的合同。

**需求 2（Tool Gateway 实现）**：实现「Agent → Gateway → Tool」三层架构；Gateway 做身份 + 权限 + Token 转换 + 审计。

#### 3. 用户身份与 Agent 身份分离

**核心**：Agent 调 Tool 时，**同时携带**两个身份信息——自己的（client_credentials）和用户的（OBO 换出的新 token）。

```
{
  "agent_identity": "agent-service-account",
  "user_identity": "alice@example.com",
  "downstream_token": "Bearer <new token with user scope>",
  "task": "send_email"
}
```

**例子**：前台 vs 客房服务员——前台（Agent）接待客人（用户）；服务员（Tool）只服务自己负责的楼层（scope）。

**需求 3（身份分离）**：Agent 调 Tool 时必须带「Agent 身份 + 用户身份」；Gateway 校验两者一致性。

#### 4. OAuth On-Behalf-Of（OBO）流

**OBO 流步骤**：

1. 用户 OAuth 授权 Agent（Authorization Code Flow + PKCE）
2. Agent 拿到用户 access_token + refresh_token
3. Agent 要调下游 Tool 时：用 client_credentials（自己身份）+ 用户 access_token → OAuth Server
4. OAuth Server 校验用户授权 + Agent 身份 → 颁发新 token（scope 受限）
5. Agent 用新 token 调下游 Tool

**关系**：Token 转发 = 用户 token 直接给下游（不安全）；OBO 流 = 用 Agent 身份 + 用户授权换新 token（安全）。

**例子**：餐厅服务员（Agent）拿客人的房卡（用户 token）去前台换房卡副本（OBO 流）——不能拿客人原房卡给酒店系统（Token 转发）。

**需求 4（OBO 流实现）**：实现完整 OBO 流；用户授权 + Agent 换 token + 下游 Tool 调用。

#### 5. Token Scope 最小化

**原则**：Token 只能拿「完成这个任务所需的最少权限」。

| 任务 | 该拿的 Scope |
|------|--------------|
| 发邮件 | `email.send` |
| 读用户订单 | `orders.read` |
| 退款 | `payment.refund.create` + 用户确认 |
| 删数据 | **不应该有** scope（需 HITL） |

**例子**：酒店服务员（Agent 跑代码）拿客人房卡只能进客人房间（scope 限定的 token）；不能进金库（Token 没有金库 scope）。

**需求 5（Scope 最小化）**：每个 Tool 定义它的 scope；Gateway 校验 Agent 申请的新 token scope 是否匹配任务。

#### 6. 权限分层（不同用户不同 Tool 权限）

| 角色 | 可调 Tool |
|------|-----------|
| **普通用户** | 读自己的数据 / 发邮件给自己 |
| **VIP 用户** | + 退款（≤ 100 元） |
| **管理员** | + 退款（任意金额）/ 删数据 |
| **Agent 自身** | 无独立权限（必须 OBO） |

**例子**：酒店 VIP 客人（金卡）能进行政酒廊（额外权限）；普通客人（银卡）只能进标准楼层（基础权限）。

**需求 6（权限分层）**：实现「用户角色 → 可调 Tool 集合」映射；Gateway 校验角色权限。

#### 7. 审计与追溯

每次 Tool 调用必须记录：

| 字段 | 含义 |
|------|------|
| `request_id` | 唯一 ID |
| `agent_id` | 哪个 Agent |
| `user_id` | 哪个用户授权的 |
| `tool_name` | 哪个 Tool |
| `tool_args` | 调了什么参数 |
| `scope` | 用了什么 scope 的 token |
| `result` | 调用结果 |
| `cost` | 花了多少钱 |

**例子**：餐厅每笔订单留底——服务员（Agent）、客人（用户）、菜名（Tool）、价格（cost）。

**需求 7（审计日志）**：实现 8 字段审计；结构化日志 + 异常行为告警。

#### 8. Token 存储、轮换、泄露撤销

| 操作 | 怎么做 |
|------|--------|
| **存储** | 不进代码 / 不进环境变量直写；走 secret manager（AWS Secrets Manager / HashiCorp Vault） |
| **轮换** | Agent Service Token 定期轮换（如 90 天） |
| **撤销** | 发现泄露立即调 OAuth Server 撤销 |
| **过期** | Token 必须有过期时间（短期 + refresh） |

**例子**：酒店员工工牌（Token）不发永久卡（无过期）；离职立即收回（撤销）；定期换新卡（轮换）。

**需求 8（Token 生命周期）**：实现 secret manager 存 Token + 定期轮换 + 泄露撤销机制。

#### 9. 跨服务身份联邦

Agent 调多个下游服务时，每个服务有自己的 OAuth Server——需要**跨服务身份联邦**：

```
Agent → OAuth Server A（用户授权 + Agent 身份） → Tool A（CRM）
   → OAuth Server B（OBO 流）              → Tool B（支付）
   → OAuth Server C（OBO 流）              → Tool C（邮件）
```

**关键**：每个下游 Tool 只看自己的 OAuth Server 颁发的 token；Agent 在中间做 OBO 转换。

**例子**：旅行社（Agent）订机票（A 航空）+ 酒店（B 酒店）+ 保险（C 保险）——每个供应商有自己的会员体系，旅行社用客户的身份证（OBO）逐个订。

**需求 9（跨服务身份联邦）**：Agent 支持多个 OAuth Server 的 OBO 流；每个下游 Tool 用自己的 token。

#### 10. MCP Authorization 规范对接

**MCP（Model Context Protocol）** 规范自带 **Authorization 段**——Agent 通过 MCP 调 Tool 时，**Tool 必须**走 MCP 规范的 OAuth 2.1 + PKCE。

| 规范要求 | 防什么 |
|----------|--------|
| **OAuth 2.1 + PKCE** | Token 拦截 |
| **Scope 声明** | Token 越权 |
| **Resource Indicators（RFC 8707）** | Token 被错用到别的资源 |
| **Token Rotation** | Token 长期有效风险 |

**例子**：餐厅服务员（Agent）必须用酒店规范的工牌（MCP 标准）进厨房（Tool），不能拿别的酒店工牌（Token 错用）。

**需求 10（MCP Auth 对接）**：实现 MCP Authorization 规范（OAuth 2.1 + PKCE + Resource Indicators）；对接真实 MCP Server 验证。

### 例子

#### 万能管家钥匙 vs 房间钥匙（上帝 Key 陷阱）

管家（Agent）不能拿酒店总钥匙（上帝 Key）→ 只能拿今天要打扫的房间的钥匙（scope 限定的 token）。

对应：**Token scope 最小化**。

#### 公司印章 vs 业务章（Tool Gateway）

公司印章（上帝 Key）能签任何合同 → 业务章（Tool Gateway）只能签自己业务的合同。

对应：**Tool Gateway 在 Tool 调用前加策略层**。

#### 前台 vs 客房服务员（身份分离）

前台（Agent）接待客人（用户）→ 服务员（Tool）只服务自己负责的楼层（scope）。

对应：**用户身份 ≠ Agent 身份**。

#### 旅行社订机酒（跨服务身份联邦）

旅行社（Agent）订机票（A 航空）+ 酒店（B 酒店）+ 保险（C 保险）→ 每个供应商有自己的会员体系（OAuth Server），旅行社用客户的身份证（OBO）逐个订。

对应：**跨服务身份联邦**。

#### Token 转发 vs OBO 流

Token 转发 = 管家拿客人房卡直接给酒店系统（不安全）→ OBO 流 = 管家拿客人房卡去前台换副本给酒店系统（安全）。

对应：**OBO 流是 Token 转发的安全替代**。

#### MCP 工牌（规范对接）

餐厅服务员（Agent）必须用酒店规范的工牌（MCP 标准）进厨房（Tool），不能拿别的酒店工牌。

对应：**MCP Authorization 规范（OAuth 2.1 + PKCE）**。

### 需求清单

> **模块 14 及之后**：下面的演示要求**写进学习者单独的真实项目**，不写进本仓库 `apps/`。`coach complete` 在进度表打钩时只对笔记里的变体覆盖逐条过，不对 `apps/` 跑 §5.4。

| # | 需求 | 场景 | 目标 | 涉及变体 | 验收标准 |
|---|------|------|------|----------|----------|
| 1 | **上帝 Key 风险演示** | 所有 Tool 共享一个 API Key | 模拟 Key 泄露影响面 | 变体 1 上帝 Key | 泄露后影响 Tool 数 + 用户数 |
| 2 | **Tool Gateway 实现** | Agent → Gateway → Tool 三层 | 身份 + 权限 + Token + 审计 | 变体 2 Gateway | Gateway 拦截率 100% |
| 3 | **身份分离** | Agent 调 Tool 带双身份 | 校验两者一致性 | 变体 3 分离 | 身份不一致被拦截的比例 |
| 4 | **OBO 流实现** | 完整 OBO 流跨服务 | Agent 换 token + 下游调用 | 变体 4 OBO | OBO 流跑通；用户授权传递 |
| 5 | **Scope 最小化** | 每个 Tool 定义 scope | Gateway 校验 scope 匹配任务 | 变体 5 最小化 | 越权 token 被拒的比例 |
| 6 | **权限分层** | 用户角色 → Tool 集合 | 不同角色不同权限 | 变体 6 分层 | 越权调用被拦截的比例 |
| 7 | **审计日志** | 8 字段审计 | 结构化日志 + 异常告警 | 变体 7 审计 | 8 字段齐全 |
| 8 | **Token 生命周期** | secret manager + 轮换 + 撤销 | 防泄露长期有效 | 变体 8 生命周期 | Token 90 天内自动轮换 |
| 9 | **跨服务身份联邦** | 多个 OAuth Server | OBO 流跨服务 | 变体 9 联邦 | 多个下游 Tool 用各自 token |
| 10 | **MCP Auth 对接** | OAuth 2.1 + PKCE + Resource Indicators | 对接真实 MCP Server | 变体 10 MCP | MCP Auth 跑通 |

### 我追问过的

本对话学习者本轮未提出知识类追问（仅下了 `coach start` / `把笔记写进小节文档` 两条命令）。无内容可沉。

### 过关自检

- **能画出「谁授权、谁执行」**：见「是什么 · OAuth On-Behalf-Of（OBO）流」（OBO 流图）+「核心概念 4」（OBO 流 5 步骤）+ 例子三段式（用户 → Agent 拿 user token → Agent 换新 token → Tool 用新 token）。
- 能说**Agent 开发为什么要懂**：见「为什么」（4 个具体后果：上帝 Key 泄露 / 用户身份混淆 / Token 长期有效 / Token 直接转发越权）。
- 能区分**用户身份 vs Agent 身份 / OAuth vs API Key / Tool Gateway vs API Gateway / OAuth 2.0 vs 2.1 / Token 转发 vs OBO 流**：见「易混点」五组对比。
- 能说出 Tool Gateway / OAuth 的 **10 个变体**：见「核心概念 1~10」。
- 能写出**每条业务需求覆盖哪个变体**：见「需求清单」第 1~10 行。

### Demo

Demo：无。模块 14 及之后这一段只检查笔记，不检查代码。需求清单的演示做在学习者单独的真实项目里，不写进本仓库 `apps/`。
