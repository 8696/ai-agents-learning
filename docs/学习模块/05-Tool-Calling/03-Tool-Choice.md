# **Tool Choice**：auto / none / required 各适合什么

> 对应模块：[模块 05 · Tool Calling / Function Calling ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 3 条
> **来源**：本对话（coach start 详解 · 2026-09-08）+ step-1 实测（MiniMax 天气+required 违约；换 thinking 模型 + required → HTTP 400）
> **状态**：已沉淀（首次沉淀 · 2026-09-08 · 增量：Provider 违约标红 + thinking×强制 Choice 边界实测写回）
> **Demo**：已落 step-1✅ + step-2✅ + step-3✅（用户开关映射）—— 详见 [Demo 子节进度](#demo-子节进度)

上一节 [Tool Description](./02-Tool-Description.md) 管的是「**说明书写得好不好** → 模型会不会乱调 / 漏调」。  
本条管另一根旋钮：**请求里显式告诉模型 —— 这一轮「可以调 / 必须调 / 禁止调 / 必须调某一个」**。

人话：Description = 菜单写清楚；Tool Choice = 这桌点菜规则（自助 / 禁点 / 必须点 / 必须点那道招牌菜）。

---

### 是什么

`tool_choice`（协议 A · OpenAI Chat Completions）与同名参数（协议 B · Anthropic Messages）是**每次请求**上的控制字段，和 `tools` 数组一起发给模型。

它管的是：**这一轮回复里，模型要不要产出 tool_call（以及能不能指定某一个）**。  
它**不管**：Tool 真不真执行、权限过不过、参数合不合法——那些是 [Tool Gateway / 幂等](./04-Tool-Gateway-幂等.md) 的事。

#### 数据怎么走（嵌进 01 已会的那一圈）

```text
你的后端组装请求：
  messages + tools + tool_choice=???
        ↓
  模型这一轮只能按规则产出：
    · 纯 content（不调）
    · tool_calls（调 ≥0 / ≥1 / 指定 1 个）
        ↓
  你的代码照旧：解析 → 执行 → tool_result → 再问模型
```

**关键一句**：`tool_choice` 是**服务端在发请求前写死的**；模型不能自己改这个字段。用户界面上的「强制查库 / 只聊天」按钮，本质也是你的后端改这个字段。

#### 协议字段对照（记语义，不背拼写）

| 语义 | 协议 A（OpenAI） | 协议 B（Anthropic） |
|------|------------------|---------------------|
| 模型自己决定 | `"auto"`（有 tools 时默认） | `{"type":"auto"}`（默认） |
| 本轮禁止调 | `"none"`（无 tools 时更接近默认） | `{"type":"none"}` |
| 本轮必须调 ≥1 个（任选） | `"required"` | `{"type":"any"}` |
| 本轮必须调指定那一个 | `{type:"function", function:{name}}` | `{type:"tool", name:"..."}` |

01 协议表里提过「强制调用 / 强制调指定」——本条把这根旋钮讲透。

#### 核心变体（§6.3 · 六个都要会）

本条核心概念 = **「谁决定这一轮能不能 / 必须 / 禁止调 Tool」**，拆成：

| # | 变体 | 一句话 |
|---|------|--------|
| 1 | `auto` | 模型在「直接答」和「调 0～N 个 Tool」之间自选 |
| 2 | `none` | 本轮禁止 tool_call；`tools` 仍可保留在请求里 |
| 3 | `required` / `any` | 本轮至少调 1 个已声明 Tool；选哪个由模型定 |
| 4 | 指定函数 / 指定 Tool | 本轮必须调你写死的那个 `name` |
| 5 | 谁写这根旋钮 | 服务端策略（用户无感）vs 用户显式意图（UI 开关）——最终都是后端改字段 |
| 6 | 边界 | 默认值；thinking/reasoning × 强制 → 常 400；B 侧 `disable_parallel_tool_use` |

---

### 为什么（Agent 开发要懂）

Description 写得再好也只是**软提示**。生产里经常需要**硬约束**：

| 不懂的后果 | 具体会怎样 |
|------------|------------|
| 永远 `auto` | 该强制走结构化抽取的路径，模型偶发纯文字 → 下游 `JSON.parse` / Zod 炸 |
| 该 `none` 却留着可调 | 总结轮模型又去「再查一次」→ 多花一轮钱、还可能改写已定稿内容 |
| 该 `required` 却只用 prompt「一定要调」 | 模型偶尔不听 → 你当 bug 修 Description，其实该换 Choice |
| 强制指定错 Tool | 用户问天气，你写死了 `search_orders` → 硬编造参数或空转 |
| 忽略「thinking / reasoning + 强制」冲突 | 协议 B 直接 **HTTP 400**（01 踩坑表已提；本条要会复述） |

前端类比：`tool_choice` ≈ 请求拦截器里的**策略开关**，不是按钮文案；Description ≈ API 文档；Gateway ≈ 真正打接口前的鉴权。

---

### 易混点

| 易混 | 差在哪 | 判错会怎样 |
|------|--------|------------|
| Tool Choice vs Tool Description | Choice = 硬规则（本轮能不能调）；Description = 软提示（该不该调、怎么填参） | 乱调时只改 Description，其实该 `none` / 指定 |
| `none` vs 不传 `tools` | `none` 可保留工具上下文；去掉 `tools` 连「工具记忆」都弱了 | 总结轮乱删 tools，模型忘掉刚查到的字段名 |
| `required` vs 指定函数 | 前者「必须调、任选」；后者「必须调这个」 | 多 Tool 时用 `required`，模型调了「能调但不该调」的那个 |
| `auto`「不调」vs Description 反例生效 | 都是没 tool_call，原因不同：策略允许不调 vs 说明书说别调 | 评测把「识破」和「策略禁调」混成一类指标 |
| 用户口头「必须查」vs `tool_choice` | 口头在 messages；Choice 在请求顶层字段 | 以为 prompt 写了就等于 `required` |
| Choice 强制 vs Gateway 放行 | Choice 管模型输出；Gateway 管你执不执行 | `required` 出了危险 Tool，你直接执行 → 事故（→ 下一条） |
| **thinking×强制 400** vs **Provider 违约（200 但无 call）** | 前者：网关直接拒请求（你看到 400）；后者：请求被接受，但 `tool_calls=[]` | 修法不同：400 → 关 thinking/换模型；违约 → 响应侧校验 + 重试/换 Provider |

补充边界事实：

1. **默认值**：无 `tools` → 只能聊天；有 `tools` → 默认 `auto`。忘传 `tool_choice` ≠ 出错，是走默认。
2. **协议 B + extended thinking / 部分 reasoning**：`any` / 指定 `tool` 常直接 400；只能 `auto` 或 `none`。
3. **Anthropic `disable_parallel_tool_use: true`**：挂在 `tool_choice` 对象上，限制本轮最多 1 个 tool——是 Choice 的「并行闸」，不是 Description。
4. **`auto` 同轮**：模型**可以**既写 `content` 又带 `tool_calls`——前端不要假设「二选一」。

---

### 例子

#### 变体 1 · `auto`（生活 + 前端）

**生活**：自助餐厅——菜单在，想吃再拿；不饿可以只喝水。  
**前端 · 电商客服默认模式**：

- 用户：「你好」→ 模型 content 打招呼，无 tool_calls  
- 用户：「单号 67890 到哪了」→ `query_logistics({order_id:"67890"})`  
- 你执行 → tool_result → 模型用中文复述状态  

#### 变体 2 · `none`

**生活**：会议室白板还在，主持人说「这轮只讨论、不许打电话叫外卖」。  
**前端 · RAG / 多轮收口**：

- Round 1–2：`auto`，查了天气 + 航班  
- Round 3：同样带着 tools，但 `tool_choice:"none"`，user：「用已有信息写行程摘要」  
- 模型只能写摘要，不能再发 `search_flight`  

为什么还带着 tools：让模型记得「刚才那些工具叫什么、结果长什么样」；去掉 `tools` 也能禁调，但上下文语义会变。

#### 变体 3 · `required` / `any`

**生活**：餐厅规定「点了桌必须至少点一道菜」，但不指定哪道。  
**前端 · 工单路由 Bot**：tools = `create_ticket` / `update_ticket` / `escalate`；每条用户消息 `tool_choice:"required"`。即使用户说「随便聊聊」，模型也必须选一个动作（产品层再决定要不要接受「硬创建」）。

只有一个 Tool 时，`required` 几乎等于强制那个——但语义仍是「≥1 个任选」；要**钉死名字**用变体 4。

#### 变体 4 · 指定函数 / 指定 Tool

**生活**：点餐机上你按了「招牌牛肉面」——厨房不能改成炒饭。  
**前端 ·「导出报表」按钮**：

- UI 点「导出本月报表」→ 后端不走 `auto`  
- `tool_choice = {type:"function", function:{name:"export_report"}}`  
- 参数可由表单注入 messages 或由模型填——但 **name 不能改成别的 Tool**  

也常用于「结构化输出伪装」：唯一 Tool + 强制调用 = 强制出结构化参数（与模块 04 对照过的套路）。

#### 变体 5 · 谁写这根旋钮

| 来源 | 例子 | 典型取值 |
|------|------|----------|
| **服务端策略**（用户无感） | 总结轮自动 `none`；抽取管线固定 `required` / 指定 | 后端状态机 |
| **用户显式意图** | UI：「只聊天 / 允许用工具 / 强制查库」 | 映射到 `none` / `auto` / `required` 或指定名 |

**生活**：导航「避开高速」是你点的；「夜间自动避开施工」是 App 策略——最终都改路线参数。  
**易混**：用户说「帮我查一下」≠ 已经设了 `required`——那只是自然语言；**没改 `tool_choice` 字段就还是 `auto`**。

#### 变体 6 · 边界（失败也要看得见）

**thinking / reasoning × 强制 Choice**：模型开着思考模式时，许多网关**直接拒收** `tool_choice=required` 以及「指定函数」的 object 形态；只允许 `auto` / `none`。

- **协议 B**：extended thinking + `any` / `type:tool` → 常 HTTP 400（01 已提）。
- **协议 A（step-1 本对话实测）**：换 thinking 模型后点 `required`，上游返回：

  ```text
  400 InternalError.Algo.InvalidParameter:
  The tool_choice parameter does not support being set to required or object in thinking mode
  ```

  请求里的 `tool_choice` 字段本身没写错——是 **Provider 硬限制**。

**产品侧怎么处理**（三选一或组合）：
1. 换非 thinking 模型再强制  
2. 关掉该模型的 thinking / reasoning  
3. 思考模型上本轮只用 `auto` / `none`（需要强制时再切模型或关 thinking）

Demo：此类错误走 HTTP 400 + 琥珀色教学卡「thinking × 强制 Choice 冲突」，不要当成笼统 502「模型调用失败」。

---

### 需求清单（每个变体 1 条 · 验收准绳）

> 清单用于 `coach complete` 时对；**不是**一次落 Demo 就全做完。step 仍按知识动态推进。

| # | 业务场景 | 目标 | 涉及变体 | 验收标准（可观察） |
|---|----------|------|----------|-------------------|
| 1 | 电商客服默认模式 | 闲聊不调、查单才调 | `auto` | 同 tools：「你好」无 tool_calls；「单号…」有 `query_logistics` |
| 2 | 多轮后写总结 | 收口禁止再查 | `none` | 总结轮请求可见 `tool_choice=none`，响应无 tool_calls，只有 content |
| 3 | 工单必须落动作 | 禁止空聊结束 | `required` / `any` | 任意 user 句，响应至少 1 个 tool_call |
| 4 | 「导出报表」按钮 | 钉死单一 Tool | 指定函数/Tool | 响应 tool name **恒等于** `export_report`，不能是别的 |
| 5 | 设置页「只聊天 / 允许工具」 | 用户意图映射 Choice | 谁设旋钮 | UI 两档切换，请求里 Choice 字段随之变，页面能对照展示 |
| 6 | thinking 模型上点强制 | 边界不炸或可解释 | 边界踩坑 | 点 `required` 时：要么成功出 tool_call，要么页面展示可理解的 400「thinking × 强制冲突」说明（含原文错误信息），不静默 |

---

### 取舍

| 场景 | 更倾向 | 为什么 |
|------|--------|--------|
| 开放式助手 / 客服 | `auto` | 有的问题要查，有的只要闲聊；硬 `required` 会逼出无意义调用 |
| 资料已齐的总结轮 | `none`（可保留 tools） | 比删掉 `tools` 更稳；比靠 prompt「不要再查」更硬 |
| 每条必须落动作的路由 | `required` / `any` | prompt「必须调」不可靠 |
| 用户点了具体动作按钮 | 指定 Tool | `required` 仍可能选错兄弟 Tool |
| 强制抽取 JSON | 指定唯一 Tool（或 `required` + 单 Tool） | 当 Structured Output 用时要钉死 schema 出口 |
| thinking 已开 / thinking 模型 | 只能 `auto` / `none`；要强制先关 thinking 或换模型 | 强制常 400（协议 A/B 都见过）；不要用「再试一次」掩盖 |

---

### 踩坑

| 坑 | 症状 | 修法 |
|----|------|------|
| 只靠 prompt「一定要调工具」 | 偶发纯文字，下游挂 | 改 `tool_choice`，不要只改 Description |
| 总结轮忘切 `none` | 模型又查一遍、改数字 | 状态机：收口轮显式 `none` |
| 多 Tool 用 `required` 当「指定」 | 调了能调但不该调的那个 | 用指定 name 的对象形态 |
| 以为口头「帮我查」= `required` | 其实仍是 `auto` | UI/后端必须改请求字段 |
| thinking + `required` / 指定对象（step-1 实测） | HTTP **400**，原文含：`The tool_choice parameter does not support being set to required or object in thinking mode` | **不是** Choice 写错。绕过：① 换非 thinking 模型 ② 关 thinking ③ 本轮只用 `auto`/`none`。Demo 标成琥珀色「thinking × 强制 Choice 冲突」教学卡，与笼统 502 分开 |
| `auto` 下只处理「有 call 或有 content」二选一 | 同轮两者都有时丢一边 | 解析逻辑同时吃 content + tool_calls |
| **国内 Provider 不守 `required`（step-1 实测 · MiniMax-M3）** | query「今天深圳天气怎么样」+ `tool_choice=required`，请求字段正确，但 `finish_reason=stop` 且 `tool_calls=[]`；模型用散文说「没有天气工具」。同 Key 下快递 query + required 则正常出 `query_logistics` | **语义没变**：required 仍应至少调列表里某个 Tool（哪怕错调物流）。生产要做**响应侧校验**：`required && !hasToolCalls` → 标违约 / 重试 / 换 Provider。Demo 卡片会标红「❌ Provider 违约」 |

---

### 我追问过的

| 问题 | 针对什么 | 回答 |
|------|---------|------|
| 「今天深圳天气怎么样」选了 required，但没有调用工具，这不是强制调用吗？ | required 语义 vs 本 Demo 只有物流 Tool vs Provider 是否守约 | 答在「踩坑 · 国内 Provider 不守 required」+「变体 3」。**语义上** required = 本轮必须至少调列表里某个 Tool（问天气也应硬调 `query_logistics`）。日志里请求已带 `tool_choice=required`，但 MiniMax 回了 `finish_reason=stop` + 空 `tool_calls`——是 **Provider 违约**，不是 Choice「其实不强制」。快递 query + required 同 Key 下会正常出 call。Demo 对这种情况标红「❌ Provider 违约」。 |
| 换了其他模型报错：`400 … tool_choice … does not support being set to required or object in thinking mode` | 以为是自己传错 / Demo bug；实际是 thinking 与强制 Choice 冲突 | 答在「变体 6 · 边界」+「踩坑 · thinking + required」。当前模型处于 **thinking / reasoning 模式**时，网关硬拒 `required` 和指定函数的 object 形态；`auto`/`none` 通常仍可用。处理：换非 thinking 模型、关 thinking、或本轮不用强制。Demo 把这类 400 做成琥珀色教学卡，与普通「模型调用失败」502 分开。 |

---

### 过关自检

对照「本条要能讲清」：能举三种模式的使用场景。

1. 用自己的话举 **`auto` / `none` / `required`** 各一个产品场景。  
2. 再说清第四种：**指定某一个 Tool** 和 `required` 差在哪。  
3. 指出：用户说「帮我查」≠ 已经设了 `required`。  
4. 指出：`tool_choice` 强制调出 ≠ Gateway 允许执行。  
5. 协议 A/B 字段各说一对（`required`↔`any`，指定 function↔`type:tool`）。  
6. thinking 开着时强制调用会怎样？（提示：常 HTTP 400；原文可能含 `does not support … required … in thinking mode`；绕过三条是什么？）

---

### 还没搞懂的

- OpenAI 较新的 `allowed_tools` 等扩展形态：本条以 auto / none / required / 指定 为主；若产品要用「白名单子集」再查官方文档补一刀。  
- 各国内 Provider 对 `required` / 指定 Tool 的兼容差异：step-1 已实测 MiniMax-M3 在「工具列表与 query 不匹配」时可能无视 `required`；其它家以实测为准。

---

### Demo 子节进度

| 状态 | 子节 | 入口 | 端口 | 本子节教学点 |
|------|------|------|------|--------------|
| ✅ | step-1 | `yarn app:05-03-tool-choice-step-1` | `50031` | 同 tools + 同 query，三档对照；Provider 违约标红；**thinking×required → 400 教学卡**（本步不执行 Tool）。**已锁定 2026-09-08** |
| ✅ | step-2 | `yarn app:05-03-tool-choice-step-2` | `50032` | 双 Tool；**required 任选 vs 钉死 name**；对照 firstToolName 恒等（变体 4；本步不执行 Tool）。**已锁定 2026-09-08** |
| ✅ | step-3 | `yarn app:05-03-tool-choice-step-3` | `50033` | **产品开关 → tool_choice 映射**（只聊天/允许工具/强制查库 → none/auto/required；变体 5）。**已锁定 2026-09-08** |

---

## §5.4 目标 ↔ 代码整合闸门

跑闸门日期：2026-09-08（step-1 已建 · 未锁定 · 教练自查草稿）

### §5.4.A 目标 → 代码覆盖

「本条要能讲清」：能举三种模式的使用场景

| 目标点 | 状态 | 证据 |
|--------|------|------|
| A1 能演示 / 对照 `auto` 下「可调可不调」 | 已实现 | step-1：选 auto + 跑 → 槽位卡片 hasToolCalls；同页可换闲聊 query 再跑观察不调 |
| A2 能演示 `none` 本轮无 tool_calls | 已实现 | step-1：选 none + 跑 → 期望 hasToolCalls=false |
| A3 能演示 `required` 至少 1 次调用 | 已实现 | step-1：选 required + 跑 → 期望 hasToolCalls=true（协议 A；B 侧 any 未做） |
| A4 指定单一 Tool 的可观察钉死 | 已实现 | step-2：钉死 query_logistics / get_weather → firstToolName 恒等判定 |
| A5 用户开关映射 Choice | 已实现 | step-3：三开关 + mappingNote + 协议判定 |
| A6 thinking/强制 400 边界 | 已实现 | step-1/2/3：thinking×required 教学卡 |

**A 段小结**：过（就目标点而言）。协议 B `any` 未单独做——可接受拆到对照/后续或靠字段表。

### §5.4.B 文档 → 代码对齐

| MD 讲点 | 代码里有没有 | 状态 |
|---------|--------------|------|
| auto / none / required 三模式对照 | step-1 三档槽位 + 差异摘要表 | 已实现 |
| 指定函数 vs required | step-2 三档对照 + firstToolName 钉死判定 | 已实现 |
| 用户开关映射 Choice | step-3 映射表 + mappingNote + 三槽 | 已实现 |
| thinking/强制 400 边界 | step-1 routes/choice catch + 前端琥珀色错误卡 | 已实现 |
| 本步不执行 Tool、只看模型是否产出 tool_calls | routes/choice + callWithToolChoice 无 execute | 已实现 |
| required 无 call / none 有 call → 标红 Provider 违约 | teaching.protocolOk + 前端 SlotCard / DiffSummary | 已实现 |

**B 段小结**：不过。指定 Tool / 用户开关 / thinking 边界仍缺。
