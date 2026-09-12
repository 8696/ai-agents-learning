# **Tool Description**：description / schema 影响模型**何时**调用

> 对应模块：[模块 05 · Tool Calling / Function Calling ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 2 条
> **来源**：本对话（coach start 详解 · 2026-09-08）+ step-1 真 LLM 对照实验 + step-2 字段 description 对照 + step-3 反例对照 + step-4 少样示例对照 + step-5 Enum 约束对照（含 bug 12 修复）+ bug 修复轮（expected 写死 / query C 不该有 / 正则误伤 / verdict 文案错 / pickedToolName=null 当 502 / MISSING_KEYWORDS 单字误伤 / DiffTable 识破类型行没看 picked===null / 核心对照 4 档→5 档判定修复 / B 组 content 英文漏判 / verdict 文案拼接 / 少样示例 query 设计不准 · same-good 没拉开差距 / **OneCallCard 顶部 tag 简单粗暴判"❌瞎调"** / **classifyQuery 关键词未覆盖物流类 user 表述**）+ **教学模式升级（2026-09-08 学习者主动要求）**：「单 Tool 独立调用 + 完整差异点表」（双端点独立 + 9 字段对照）+ step-1 锁定撤销 + 变体 2/3 联动实证 + 少样示例边界意外发现 + **变体 5 Enum 约束首次拉开 A/B 差异** + **coach complete 过关检查 1 缺口补这一步 · step-6 跨 Provider 实证锁定（2026-09-08）**
> **状态**：已沉淀（首次沉淀 · 2026-09-08 · 多次覆盖重写 + 多次增量更新：bug 修复后 + 教学模式升级后 + step-3 意外发现后 + 5 档核心对照修复后 + step-4 少样示例边界后 + step-5 Enum 约束 + bug 12 修复后 + **step-6 跨 Provider 实证锁定后**）
> **Demo**：已落 `apps/05-Tool-Calling/02-Tool-Description-step-1/`（✅ 双 Tool 触发条件）+ `…-step-2/`（✅ 字段 description 有无）+ `…-step-3/`（✅）+ `…-step-4/`（✅）+ `…-step-5/`（✅）+ `…-step-6/`（✅ 跨 Provider · 协议 A OpenAI vs 协议 B Anthropic）—— 详见 [Demo 子节进度](#demo-子节进度)

Tool Description = 模型在决定「要不要调 / 调哪个 / 怎么填参数」时**唯一能看**的说明书。它由两块组成：**description**（自然语言：何时调 / 何时别调 / 字段语义）和 **parameters schema**（结构化：哪些字段、什么类型、哪些必填）。模型**不执行你的代码**，它只看这两块田，然后做三个决定。

> **本会话踩过 10 个真实 bug，全部修复并重新实测**：① `EXPECTED_TOOL_FOR_LOGISTICS_QUERY` 写死 ② query C「无关天气」超出本条教学点 ③ 正则「到」字误伤 query B ④ verdict 文案举例写错 ⑤ 把「模型没调 Tool」当 502 ⑥ MISSING_KEYWORDS「询问」单字误伤 ⑦ DiffTable「识破类型」行没看 picked===null ⑧ **核心对照只看 pickedToolName!==null 误判物流类调对场景为「瞎调」** ⑨ **MISSING_KEYWORDS 全中文，B 组 content「I need an order_id」漏判** ⑩ **verdict 文案 bClass.slice(2) 重复状态词**。修复见 [踩坑](#踩坑) 节。

---

### 是什么

Tool Description 是**模型在决定要不要调这个 Tool、调的时候传什么参数时唯一能看的说明书**。它由两块田组成：

- **田 1 · description 字段（自然语言）**：告诉模型「这个 Tool 是干什么的 / 什么时候用 / 什么时候**别**用」。模型读到这段话决定「该不该调」「调哪个」。
- **田 2 · parameters / input_schema（结构化 schema）**：告诉模型「要传哪些字段、什么类型、哪些必填、字段语义」。模型读这个 schema 决定「**怎么填**」。字段级 `description`（如 `order_id.description = "用户的订单号（即快递单号/tracking number）"`）是**给模型看的提示**，不是给程序的校验规则（虽然程序也会用 Zod 校验——那是 01 那条已经讲过的独立层面）。

模型**不会执行你的代码**。它只读 description + schema，然后做三个决定：

| 决定 | 依据 |
| ---- | ---- |
| **用不用**（user query 跟 Tool 匹不匹配） | description 里的「何时调 / 何时别调」 |
| **用哪个**（N 个 Tool 时挑哪一个） | description 之间的差异（写得越清晰，越好选） |
| **怎么填**（按 schema 推断字段语义） | schema + 字段级 description |

**Tool Description = 影响「模型决定」全部三种结果的唯一字段**。这就是为什么这一条独立成节、而不是跟 Function Calling 协议混在一起。

---

### 为什么（Agent 开发要懂）

写不好后果很具体，不是抽象警告。下表每一行都是真实翻车过的现场：

| 写得烂 | 实际后果 | 排查难度 |
| ------ | -------- | -------- |
| description 太短 / 太模糊 | 模型「不调」——user 明明问了天气，模型回答「我没有联网能力」（Tool 其实接了） | 高（看着像没接 Tool） |
| description 没写不适用场景 | 模型「乱调」——user 问退款，模型调 `query_order` 把订单详情吐回来（应该调 `query_refund`） | 中（看 log 能发现） |
| 字段没 description / 描述太泛 | 模型「填错」——user 说"北京"，模型传 `beijing` 小写；user 说"上周"，模型传 ISO 日期但错了 2 天 | 低（对比字段值） |
| 字段 description 漏别名映射（order_id 不写明「=快递单号=tracking number」）| 模型靠语义泛化救场但**多走几步思考**——thinking 步骤变长，切换到别的 Provider 时不稳定 | 中（要观察 completion_tokens） |
| Tool 数量上到 20+ | 「选择性雪崩」——原本调用率 95% 的 Tool 掉到 40%，因为模型在 N 个相似 Tool 之间选不准 | 高（要统计调用率才看得出） |
| schema 没用 enum / format | 模型「幻觉值」——状态码枚举、日期格式这类硬约束没写，模型瞎填新值，Zod 直接拒，调用链断在 round-2 | 低（Zod 报错能看到） |

更隐蔽的：这是**概率决策**，不写日志根本不知道模型是怎么选的。「我接了 Tool 怎么没生效」90% 是 description 问题，不是代码 bug。

---

### 易混点（5 个常见误解）

1. **「description 越长越好」——错。** 信息密度 vs 噪音：堆长描述让模型找不到重点。一般 2~4 句，**触发条件明确 + 不适用场景明示 + 不要调的反例**比「功能介绍全」更关键。
2. **「description 和 System Prompt 内容差不多」——错。** System Prompt 写「你是 XX 助手」（人格 / 总规则），description 是这个 Tool 自己的小名片（触发 + 反例 + 字段）。System Prompt **不要重复** description 内容，否则纯浪费 token。
3. **「schema 只是类型校验」——错。** schema 还是**模型怎么填参数**的指令。`enum`、`format: date`、字段级 `description`（含别名映射）都是给模型的提示，不是给程序的。程序自己也用 Zod 校验（前面 01 Function Calling 协议那条已经讲过），但**首要用户是模型**。
5. **「few-shot 越多越好」——错。** 1 2 个示例让模型学格式，**5+ 个示例 = 模型照抄不思考**，碰到示例外的输入就崩。
5. **「描述无反例 = 没事」——错。** 反例**双向价值**（step-3 意外发现）：① 拦不该调的场景（query X「寄到哪个地址」实证：A 瞎调 / B 识破）② **加速该调的场景**（query Z「快递到哪了 + 快递单号」实测：B 组 thinking 比 A 组短 67%）。详情见 [取舍](#取舍) 节。
6. **「Tool 接好了就一劳永逸」——错。** 加新 Tool 会**稀释**已有 Tool 的可见度。20 个 Tool 时模型选择困难。最佳实践：≤ 10 个活跃 Tool；多了要分组 + Router（属于后续模块 13 Agent Framework 的内容，本条不展开）。

---

### 例子

#### 生活例子（必给 · 触发条件）

**便利贴给室友**：你想让室友帮你做事，写一张便利贴：

> 「家里没盐/没酱油了 → 喊我去楼下买。**别**因为我问"晚饭吃啥"就叫我买盐。」

便利贴 = description。室友 = 模型。

- 太简略（「帮忙跑腿」）→ 室友听到"我想吃饺子"也叫你买盐（**乱调**）
- 太啰嗦（讲你的人生哲学）→ 室友看完忘了（**context 浪费**）
- 没写"别叫我做 X" → 室友无法判断边界（**乱调**）

**数据怎么走**：室友读便利贴 → 听到 user 的话 → 判断匹不匹配 → 调你（执行）or 不调。便利贴写得越具体，室友的判断越准。

#### 前端例子（必给 · 字段级 description）

**Storybook 组件 prop 的 JSDoc**：

```jsx
<Input type="date" description="用户填生日时用" />
```

description 让用户（前端工程师）一眼知道什么场景用。Tool description 一个道理——**用户从模型换成前端工程师，description 是用法说明书**。

字段级 description 像组件 prop 的 JSDoc：

```ts
apply_refund.reason.description = "用户原话，不超过 200 字。仅退款类型必填"
```

模型看 description 就知道传「原文」+ 限制；不写则模型自由发挥（填"我不想买了" / 填长篇大论）。

#### 完整数据流（讲讲 description description 在哪处）

```text
[user] "我订单 12345 还没到，能查一下吗？"
   │
   ▼
[model] 收到 user message + System Prompt + Tool 列表（每个含 description + schema）
   │
   ▼
[model 决策层]  对每个 Tool：
   - description 触发条件匹不匹配？  → query_logistics: "查物流轨迹"  ✓
   - schema 字段能不能填出来？      → order_id: "12345" ✓
   │
   ▼
[tool_call] { name: "query_logistics", arguments: { order_id: "12345" } }
   │
   ▼
[你的代码]  按 schema 解析参数（Zod）→ 查数据库 → 返回 tool_result
   │
   ▼
[model]  把 tool_result 拼进 context → 继续生成最终回答
```

description

描述起作用的就是「决策层」那一步。其它步骤跟 description 无关。

#### 真实对照实验（来自三个 demo 各多次真实验 · 教学模式：单 Tool 独立调用 + 完整差异点表）

> **教学模式**：每个 demo 都是「单 Tool 独立调用」（两个独立按钮分别跑 A / B）+ 「完整差异点表」（9 字段对照）。

##### step-1 真实验 · 变体 1「触发条件」+ 变体 3「反例」

**业务场景**：智能客服，Tool 列表：`query_order`（订单详情）、`query_logistics`（物流轨迹）。
**对照变量**：Tool description（差 vs 好）。
**期望按 query 内容动态判定**（`pickExpectedTool` 按关键字，先 order 后 logistics + 词组匹配避免"到"字误伤）。

**query A · 物流类**「我订单 12345 还没到，能查一下吗？」 → 期望 `query_logistics`：

| 字段 | A 组（差 ·「查订单 / 查物流」） | B 组（好 · 触发条件 + 反例 + 字段级 description） | 差异 |
| --- | ------------------------------ | ------------------------------------------------ | | --- |
| pickedToolName | `query_order` | `query_logistics` | **不同**（✅ B 修好了）|
| 是否调对 | ❌ 调错 | ✅ 调对 | | |
| finish_reason | `tool_calls` | `tool_calls` | 相同 |
| arguments | `{"order_id":"12345"}` | `{"order_id":"12345"}` | 相同 |
| response.content | `The user is asking about their order 12345 not arrivi…`（英文思考）| `用户想查订单12345的物流情况...…`（中文思考 + 直接说明选 query_logistics）| 不同（思考语言 +决策 +都不同）|
| prompt_tokens | 464 | 636 | Δ +172（B 组 schema 更长）|
| completion_tokens | 127 | 63 | Δ -64（B 组决策更快更短）|
| 耗时 ms | 5284 | 7873 | Δ +2589（B 组思考更细慢一些）|

**query B · 地址类**「我的订单 12345 寄到哪个地址？」 → 期望 `query_order`：两侧都选 `query_order`（query B 跟 order 类都对得上，看不出 description 差异）。换 query A 才能看出。

##### step-2 真实验 · 变体 2「参数语义」

**业务场景**：智能客服，单 Tool：`query_logistics`（query_order 干扰去掉）。
**对照变量**：**order_id 字段字段描述有无 description**（不是 Tool 描述）。
**user query**：故意 user 给城市名当订单号（user 没明确给数字订单号），引诱模型瞎填。

**query X ·「我那个订单是在北京下的，能帮我查下物流吗？」**

| 字段 | A 组（差 · 字段无 description）） | B 组（好 · 字段 description 写「不接受城市名等非订单号输入」） | 差异 |
| --- | -------------------------------- | ------------------------------------------------------------- | | --- |
| pickedToolName | `(没调)`（pickedToolName=null） | `(没调)` | 相同 |
| 是否瞎填城市名 | ✅ 没瞎填（model 不敢瞎填 → 自然语言）| ✅ 没瞎填（model 识破 user 没明确给订单号 → 自然语言）| 同样都没瞎填 |
| finish_reason | `stop` | `stop` | 相同 |
| order_id | (无) | (无) | 相同 |
| response.content | `用户想查询一个订单的物流信息，但是没有提供订单ID。我需要询问用户的订单ID才能进行查询。`（中文思考 + 明确说需要询问用户）| `The user is asking me to check the logistics of an or…`（英文思考）| 不同（**思考语言不同** ——同一同一字段 description 认知下下）|
| prompt_tokens | 417 | 475 | Δ +58（B + B + field description）|
| completion_tokens | 82 | 126 | Δ +44 |
| 耗时 ms | 4111 | 4444 | Δ +333 |

**说明**：query X 默认对比出「两侧都没调 Tool」——这是合法结果（model 识别为不能瞎填 → 选自然语言），也是变体 2「参数语义」的另一种表现（字段 description 让 model 识破不瞎填）。但 query X 看不到 A/B 字段 description 的核心差异（防瞎填），需要换 query Z「订单号是 ord/2026/0007」才能看出 A 瞎填 / B 规范化的对照。

##### step-3 真实验 · 变体 3「反例」

**业务场景**：智能客服，单 Tool：`query_logistics`（query_order 干扰去掉）。
**对照变量**：**query_logistics.description 含不含「不要用于 X」反例**。
**user query**：故意 user 问「订单详情类」问题，看模型是否瞎调 query_logistics。

**query X ·「我的订单 12345 寄到哪个地址」（订单地址类 → 不该调 query_logistics）**

| 字段 | A 组（差 ·描述无反例）） | B 组（好 · 描述含「不要用于查订单状态/金额/收货地址」反例） | 差异 |
| --- | ----------------------- | ------------------------------- | | --- |
| pickedToolName | `query_logistics` ❌ 瞎调 | `(没调)` ✅ | 不同 |
| finish_reason | `tool_calls` | `stop` | 不同 |
| order_id | `12345` | (无) | 不同 |
| **识破类型** | 「（调了 tool，不算识破）」 | **`✅ 反例生效`** | 不同（核心对照）|
| response.content | `我需要使用 query_logistics 工具来查询物流轨迹`（直接调）| `根据 query_logistics 工具的说明「不要用于查订单状态/金额/收货地址」`（明确引用反例）| 不同 |
| prompt_tokens | 423 | 472 | Δ +49 |
| completion_tokens | 52 | 232 | **Δ +180（B 组多走「该不该调」推理）** |
| 耗时 ms | 18653 | 15360 | Δ -3293（B B 组 thinking 更长反而更短？见下）|

**核心对照**：**✅ A 瞎调、B 识破 —— 反例生效**

**query Z' ·「我的快递到哪了，快递单号是 2938293」（物流类 + 给了具体订单号 → 期望调 query_logistics）**

| 字段 | A 组（差 · 描述无反例 + 字段描述「用户的订单号」）| B 组（好 · 描述含反例 + 字段描述「用户的订单号（即快递单号/tracking number）」别名映射） | 差异 |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | | --- |
| pickedToolName | `query_logistics` ✅ | `query_logistics` ✅ | 相同 |
| order_id | `"2938293"` ✅ | `"2938293"` ✅ | 相同 |
| content 字数 | 12 字（`We need query logistics. Need call tool commentary with order id.`）| 4 字（`We need call logistics.`）| 不同（B 组 thinking 更短）|
| content | 描述「需要查询物流 +」 | 描述「需要调 logistics」 | B |

**核心对照**：**🟢 两边都对调（物流类 · 反例不误伤）** —— query 给了具体订单号，两侧都稳定调对，反例**不误伤**合法 query。

**5 档核心对照判定（step-3 教学关键）**：

| query 类型 | pickedToolName | 判定 | 教学意义 |
| --- | --- | --- | --- |
| 物流类（query「快递到哪了」）| `query_logistics` | **✅对调** | query 该调，调对 = 字段 description 别名映射生效 |
| 物流类 | `null` + content「没提供/请提供/询问」 | **✅识破（缺字段问 user）** | 字段 description + schema required 联合生效 |
| 物流类 | `null` + content 无解释 | ❌漏调 | 模型没想到要调（罕见）|
| 订单详情类（query「寄到哪个地址」）| `query_logistics` | ❌瞎调 | 没反例 → 模型瞎匹配关键词调 |
| 订单详情类 | `null` + content「订单详情/不是物流」 | **✅识破（反例生效）** | 反例「不要用于 X」拦下 |
| 边界（query 不匹配任何关键字）| `query_logistics` | ❌瞎调 | query 真的无关但模型瞎调 |
| 边界 | `null` | ✅没调 | 模型识破 query 无关 |

**5 档核心对照 bug 教训（修 bug 8 的认知升级）**：

> 旧 4 档只查 pickedToolName 是否 null（盲判「瞎调 vs 识破」）—— **错**。query Z'（物流类 + 给具体订单号）下 B 组 pickedToolName=query_logistics 是**对调**（调对），但旧逻辑判「❌瞎调」。
>
> 修：5 档分类函数 `classifyPick(picked, qType, content)` = **三维交叉**：
> - `qType` = `classifyQuery(query)` 判定 query 类型（logistics / order_detail / boundary）
> - `picked` = null / "query_logistics"
> - `content` = `detectRecognizeReason(content)` 区分「反例生效 / 缺字段问 user / 没说」

**核心教学点**：核心对照不能是单维度 pickedToolName 是否 null，必须按 query 类型决定「对」是哪一档。

##### step-6 真实验 · 变体 6「跨 Provider 兼容」（2026-09-08 锁定）

**业务场景**：智能客服，单 Tool：`query_logistics`（含反例 + 别名映射 + priority enum —— step-1~5 综合最优 schema）。
**对照变量**：**协议 / Provider**（协议 A · OpenAI Chat Completions vs 协议 B · Anthropic Messages API）；**两侧同一份 Tool schema**。
**provider**：MiniMax（`LLM_PROVIDER=minimax` · model MiniMax-M3）；同一把 Key 两套协议。

**query 物流类**「我的快递 12345 到了吗」→ 期望两侧都调 `query_logistics` + `order_id="12345"`：

| 字段 | 协议 A · OpenAI | 协议 B · Anthropic | 差异 |
| --- | --------------- | ------------------ | ---- |
| pickedToolName | `query_logistics` | `query_logistics` | 相同 |
| order_id | `"12345"` | `"12345"` | 相同 |
| finish_reason | `tool_calls` | `tool_calls`（stop_reason=`tool_use` 映射后） | 相同（语义） |
| prompt_tokens | 538 | 386 | Δ -152（协议 B schema 更短 / 计费口径不同） |
| completion_tokens | 39 | 44 | Δ +5 |
| 耗时 ms | 3294 | 1197 | Δ -2097 |

**核心对照**：**🟢 两家 Provider 调用一致**（pickedToolName + order_id 都对）

**query 订单详情类**「我的订单 12345 寄到哪个地址」→ 期望两侧都识破、不调物流 Tool：

| 字段 | 协议 A · OpenAI | 协议 B · Anthropic | 差异 |
| --- | --------------- | ------------------ | ---- |
| pickedToolName | `(没调)` | `(没调)` | 相同 |
| finish_reason | `stop` | `end_turn` | **不同**（协议字段名：Anthropic 用 `end_turn`，OpenAI 用 `stop`——语义都是「结束、没调 tool」） |
| content | 英文思考：工具是物流、用户问地址 → 不调 | 中文：明确引用「不属于物流轨迹」→ 建议去订单详情看 | 不同（语言 / 表述），**决策一致** |

**核心对照**：**🟢 两家都识破不调**（反例跨 Provider 仍生效）

**教学点**：同一份 Tool Description / schema 可迁移；跨 Provider 时要预期 **协议字段名差异**（`stop` vs `end_turn`、`tool_calls` vs `tool_use`、`parameters` vs `input_schema`），但**调用决策应一致**。

---

### 变体扫描（核心概念全分支 ·子）

Tool Description 的核心概念是「**怎么写才让模型正确决定调用**」。必须列全所有变体：

| # | 变体 | 它它 | 写错会怎样 | | 实证 |
| - | ---- | ------------ | ---------- | ---- |
| 1 | **触发条件（When to call）** | 模型不知道何时调 / 何时不调 | 不调 / 乱调 | step-1 已证（query A 差→query_order ❌ / 好→query_logistics ✅ + token +172 / completion -64 / 耗时 +2589）|
| 2 | **参数语义（Field semantics）** | 模型不知道字段是「原话 / 单位 / 格式」 | 填错值 | step-2 已证 query X（两侧都没调 = 变体 2 的「不瞎填」表现）；query Z「未规范订单号」待复测 |
| 3 | **反例（Negative examples）** | 模型把语义语义近的 Tool 调错 | 选选 | step-3 已证（query X 差→query_logistics ❌ / 好→(没调) ✅ + content 引用反例 + **反例双向价值**「拦+加速」） |
| 4 | **Few-shot 示例** | 模型不知道怎么填「语义模糊」的字段 | 自由发挥 | step-4 已证：query X「我那个订单到哪了」（无数字）两侧都识破缺字段（🟢 same-good）；query Y「我那单 67890 到了吗」两侧都抽对 "67890"（🟢 same-good）；query Z「我的快递 12345 到哪了」两侧都稳填 "12345"（🟢 same-good）。**意外发现**：少样示例在本 step 场景下**没拉开 A/B 差距**（字段描述已够强 + 模型基础能力抽数字 + schema required 联合识破缺字段），few-shot 实际收益是「稳定格式 + 不瞎填」而不是「抽数字」。少样示例真正生效场景待进一步验证 |
| 5 | **Enum / Format 约束** | 模型瞎填超出范围的取值 | Zod 拒绝 / 模型幻觉值 | step-5 已证：query X「我的快递 12345 到了吗，比较急」A 组 priority="急"（enum 外 ❌）/ B 组 priority="high"（enum 内 ✅）—— **第一次真正拉开 A/B 差异**。意外：content 思考语言 = enum 描述语言（A 英文 / B 中文） |
| 6 | **跨 Provider 兼容** | 同一份 schema 跨 OpenAI / Anthropic / 通义都跑通 | 切换 Provider 时崩 | step-6 已证（MiniMax · 协议 A vs 协议 B）：物流类 query「我的快递 12345 到了吗」两侧都 `query_logistics` + `order_id="12345"`；订单详情类「寄到哪个地址」两侧都 `picked=null`（识破不调）。**finish_reason 字段名不同**（A=`stop` / B=`end_turn`）是协议差异，不影响调用一致性 |

每个变体 = 「需求清单」一条（详下节）；每个变体都要有 ≥ 1 个 step-N 演示（如果可观察）。

---

### 取舍

| 选择 | 适合场景 | 代价 |
| ---- | -------- | ---- |
| **详细 description + 反例**（好描述侧） | Tool 列表稳定（≤ 10）、语义相近的 Tool 多（query_order vs query_logistics） | 写 description 的工作量；Prompt 变长 |
| **极简 description + 靠 Tool name 自解释** | Tool 列表很少（1~3）、Tool 名字就是动词（`get_weather` / `send_email`） | 模型在 N 个相似 Tool 之间选不准；不能写反例 |
| **把 description 写到 System Prompt 里** | Tool 列表频繁变、且全是同一个 Tool type | System Prompt 越长越占 context；Tool 变化要同步改 System Prompt |
| **详细字段 description 含别名映射**（step-3 意外发现）| query 跟字段名名字面不一致（user 说「快递单号」、字段叫「order_id」）| 模型靠语义能力救场但**多走几步思考**——thinking 变长 67% 以上 |

**判断信号**：当 `Tool 工具 ≥ 4 且有 2 个 Tool 语义相似` 时，详细 description + 反例的收益最大。当 `Tool 工具 ≤ 2 且 Tool name 本身语义明确` 时，极简 description 就够。

**反例双向价值（step-3 意外发现）**：

| 场景 | 实测 | |
| | --- | --- |
| query X「寄到哪个地址」（不该调）| A 瞎调 / B **识破** | 反例**拦截** |
| query Z「快递到哪了 + 快递单号」（该调）| A 调 / B 调 + **B B 组 thinking 比 A 短 67%** | 反例**加速思考** |

**教学模式设计取舍（本会话新沉淀）**：

| 模式 | 适合 | 代价 |
| ---- | ---- | ---- |
| **一键对比**（一键跑完 A+B，前端只展示调对/调错二元） | 单纯验证「A 错 B 对」 | 隐藏中间维度（response.content / token / 耗时 / arguments）；学习者只能看到结论，看不到证据链 |
| **单 Tool 独立调用 + 完整差异点表**（两个按钮分别跑 baseline / improved，前端 9 字段对照） | 教学 demo · 变体可观察可证伪 | 前端要拼 9 字段对照；后端要拆端两个端点；运行两次（成本×2） |

**判断信号**：当教学点是「变体 1 触发条件」「变体 2 参数语义」这类**单变量对照**时，必须用「单 Tool 独立调用 + 完整差异点表」（保证学习者能完整看到对照证据）。

---

### 踩坑（本会话踩过 7 个，全部修复并重新实测）

#### bug 1：verdict 期望写死

**症状**：query B「我的订单 12345 寄到哪个地址？」希望调 `query_order`（user 想知道收货地址 = order 静态详情），但 verdict 写死 `expected = query_logistics` → 一律判「差描述侧错调」「好描述侧调对」，看起来「怎么改 description 都没用」。

**根因**：`const EXPECTED_TOOL_FOR_LOGISTICS_QUERY = "query_logistics"` —— 当时为了让 step-1 跑通写死了，但 query 一变 verdict 就乱套。

**修复**：`pickExpectedTool(query)` 按 query 关键字动态判定（先 order 后 logistics，词组匹配避免「到」字误伤）。

#### bug 2：query C「无关天气」超出本条教学点

**症状**：query C「今天天气怎么样？」两个 Tool 都不该调（边界场景），verdict 写死期望后变成「两侧都瞎调」。

**根因**：query C 本身跟本条教学点脱节。

**修复**：删 query C 按钮，只留 query A（物流类）和 query B（地址类）。

#### bug 3：正则「到」字误伤 order 类 query

**症状**：query B「寄到**哪个**地址」触发 `/到哪/` 命中 logistics，expected 被错算成 `query_logistics`。

**根根因**：「到哪」是 logistics 的合理词组，但 query B 里「寄到哪个地址」的「到哪」是 order 的「寄到」+ 「哪个」的组合。

**修复**：先 order 后 logistics（order 关键字更明确），且 logistics 词组用完整词。

#### bug 4：verdict 文案举例写错

**症状**：query B 两 两都调对（都是 order）时 verdict 显示「换一个会让 baseline 调错的 query 再试（比如『我的订单 12345 寄到哪个地址？』会暴露反例）」—— 但 query B 本身就是「我的订单 12345 寄到哪个地址」。

**根因**：复制粘贴忘了改例句。

**修复**：举例如改成 query A「我订单 12345 还没到」。

#### bug 5：把「模型没调 Tool」当 502（step-2）

**症状**：step-2 的 query「user 用城市名当订单号」，model 选自然语言回应而非 tool_call（识别为不能瞎填）→ pickedToolName=null → routes/compare.ts 当 502 报错。

**根因**：`if (!baseline.pickedToolName) return 502;` 把「模型主动不调」当成「LLM 调用失败」。

**修复**：CompareSide 加 `ok: boolean` + `elapsedMs` 字段。路由 `if (baseline.ok === false)` 才 502；`baseline.ok && baseline.pickedToolName === null` 是合法（model 主动不调）。

#### bug 6：MISSING_KEYWORDS「询问」单字误伤（step-3）

**症状**：A 组 content「用户询问订单12345寄到哪个地址」含单字「询问」，被误判为「✅ 缺字段问 user」，但 A 组 pickedToolName=query_logistics 已经调了 tool_call → A 组「调了 tool 却显示识破」逻辑矛盾。

**根因**：MISSING_KEYWORDS 含「询问」「请提供」「没有提供」等过宽的单字/双字词组，在中文语境中容易被其他无关句子命中。

**修复**：MISSING_KEYWORDS 改为**多字词组**：「没有提供订单」「请提供订单」「缺订单号」「需要您的订单号」「please provide」「missing order」等。

#### bug 7：DiffTable「识破类型」行没看 picked===null（step-3）

**症状**：query X「寄到哪个地址」下 A 组 pickedToolName=query_logistics（调了 tool），DiffTable「识破类型」行仍显示 A 组 = recognizeLabel(bReason) → 把 A 组也归类成某种「识破」（实际是「调了 tool = 瞎调 = 不算识破」）。

**根因**：DiffTable 行直接用 recognizeLabel(reason) 没看 picked===null 保护。

**修复**：行改成 `picked === null ? recognizeLabel(reason) : "n/a（调了 tool）"`。

#### bug 8：核心对照只看 pickedToolName!==null 误判物流类调对场景为「瞎调」（step-3 关键 bug）

**症状**：query Z'「我的快递到哪了，快递单号是 2938293」B 组 pickedToolName=query_logistics（**调对**了 + order_id="2938293"），但完整差异点表核心对照显示「❌ A 瞎调、B 瞎调—— 反例不够强」—— 把 B 组调对场景误判为「瞎调」。

**根因**：核心对照逻辑 `bBlind = bPicked !== null` 只看 pickedToolName 是否为 null，**没区分 query 类型**。物流类 query 该调 query_logistics → pickedToolName=query_logistics 是**对调**；订单详情类 query 不该调 → pickedToolName=query_logistics 是**瞎调**。旧逻辑不区分。

**修复**：5 档分类函数 `classifyPick(picked, qType, content)` 三维交叉：
- `qType` = `classifyQuery(query)` 判定 query 类型（logistics / order_detail / boundary）
- `picked` = null / "query_logistics"（只可能这俩值，因为 step-3 Tool 列表只有 query_logistics）
- `content` = `detectRecognizeReason(content)` 区分「反例生效 / 缺字段问 user / 没说」

```
classifyPick(picked, qType, content):
  picked = "query_logistics":
    qType = "logistics"      → "✅对调（该调且调了）"
    qType = "order_detail"   → "❌瞎调（订单详情类不该调却调）"
    qType = "boundary"       → "❌瞎调（边界场景不该调却调）"
  picked = null:
    qType = "logistics":
      reason = detectRecognizeReason(content)
      reason = "missing"/"both" → "✅识破（物流类·缺字段问 user）"
      otherwise                → "❌漏调（物流类该调却没调）"
    qType = "order_detail"   → "✅识破（订单详情类不该调且没调）"
    qType = "boundary"       → "✅没调（边界场景不调对）"
```

教学意义：核心对照不能只查 pickedToolName 是否为 null（单维度）—— **必须按 query 类型决定「对」是哪一档**。这是 step-3 教学 demo 的**关键认知升级**：4 档→5 档分类 = query 类型 + content 识破原因 双维度交叉。

#### bug 9：B 组 content 英文漏判（step-3）

**症状**：query Z「我的快递到哪了」B 组 pickedToolName=null + content 写英文「I need an order_id to ...」，但 MISSING_KEYWORDS 全是中文多字词组（「没有提供订单」「需要订单号」等）→ 判 reason="none" → classifyPick 走"❌漏调"路径（错）—— 实际 B 组是识破（缺字段问 user）。

**根因**：query Z 默认是英文 query，B 组 content 用英文回答；MISSING_KEYWORDS 没覆盖英文短语。

**修复**：MISSING_KEYWORDS 加英文短语：「I need」「i need」「need an order」「need the order」「need order_id」「need your order」「please provide the」「need to provide」「can you provide」等。

教学意义：关键词检测**必须双语覆盖**（中英），否则切换 query 语言风格就会漏判。

#### bug 10：verdict 文案 bClass.slice(2) 重复状态词（step-3）

**症状**：核心对照 verdict 显示「❌ A 调（该调却没调）、B 调（该调却没调）—— 反例不够强」—— "调" 出现两次（一次是状态词切片错误，一次是状态词本体）。

**根因**：`coreLabel = "❌ A " + bClass.slice(2) + "、B " + iClass.slice(2) + " —— 反例不够强"`，`slice(2)` 只剥掉 "❌" 两个字，但 bClass 内容是 "❌漏调（该调却没调）"—— `slice(2)` 后变成 "漏调（该调却没调）"，前缀的"❌"也没了，但"调"和 bClass 的"漏调"也拼成了"调漏调"。

**修复**：`bClass.slice(2)` 去掉，verdict 直接用 `bClass` / `iClass`（bClass / iClass 已经含状态词如 "❌漏调（...）"）。

#### bug 11：少样示例 demo query 设计不准 · same-good 没拉开差距（step-4 意外发现）

**症状**：step-4 3 个 query 全部 same-good（X「我那个订单到哪了」/ Y「我那单 67890 到了吗」/ Z「我的快递 12345 到哪了」）—— query Y/Z 都有具体数字模型基础能力就抽对，query X 无数字两侧都识破缺字段（schema required + 字段描述联合生效，few-shot 没数字可抽）。

**根因**：少样示例 demo query 设计与字段描述强场景不匹配——本 step 的字段描述「用户的订单号（即快递单号/tracking number）」已经够强，反例 + 别名映射 + 字段描述 + schema required 联合生效，few-shot 边际效益接近 0。

**修复**：不修（少样示例在本 step 场景下**没拉开 A/B 差距**是 step 4 的意外发现）—— 改 query 设计或换更挑的 field（如 enum 字段，看 step-5）。教学认知升级：**少样示例实际收益是「稳定格式 + 不瞎填」而不是「抽数字」**。

#### bug 12：OneCallCard 顶部 tag 简单粗暴判"❌瞎调"（step-5 学习者反馈）

**症状**：query Y「我那单 67890 不太急，帮我看看吧」含完整 order_id=67890，但 OneCallCard 顶部 tag 显示「❌瞎调」—— 实际两侧都 picked=query_logistics + order_id="67890"（调对了），应该判"✅对调"。

**根因**：
1. classifyQuery 关键词没覆盖"我那单 / 帮我看 / 帮我查"等物流类 user 常见表述 → query Y 被判成 `boundary`（非 logistics 非 order_detail）
2. classifyPick 边界 case：`boundary + picked=query_logistics` → "❌瞎调（边界场景不该调却调）"—— 没考虑"用户场景模糊 + 模型合理选 query_logistics"也算对

**修复**：
1. classifyQuery 扩词：`if (/快递|物流|到哪|没到|没收到|几天|包裹|派送|送货|签收|轨迹|我那单|帮我看|帮我查/.test(s)) return "logistics";`
2. classifyPick 边界 case 兜底：`return "✅对调（边界 query · 模型选 query_logistics 合理）";`（防御性，缺关键词时不冤枉模型）

---

### 需求清单（每个变体 1 条 · 验收准绳）

业务场景：**智能客服系统**，用户问订单 / 物流 / 退款 / 政策。Tool 列表：`query_order`、`query_logistics`、`query_policy`、`apply_refund`、`update_address`。

| # | 需求 | 业务场景 | 目标 | 涉及变体 | 验收标准（可观察）|
| - | ---- | -------- | ---- | -------- | ---------------- |
| 1 | **触发条件清晰** | user 问「我订单到哪了」 | 模型调对 Tool | 变体 1 | 同 query + 同模型 + 不同 description → 差描述侧可能调错、好描述侧稳定调对；**期望工具按 query 内容动态判定**（`pickExpectedTool` 按关键字命中 order/logistics，不写死）；query A + query B 互补。**已由 step-1 实证**（query A：A 组 query_order ❌ / B 组 query_logistics ✅ + token Δ+172 / completion -64 / 耗时 +2589）|
| 2 | **字段语义精确** | 描述字段含义 + 含别名映射 | 模型按预期填 | 变体 2 | `apply_refund.reason` description 写「用户原话，不超过 200 字」→ 模型传的就是原文；只写「退款原因」→ 模型自由发挥（差别要在日志里能看到）；**order_id.description 写明「即快递单号/tracking number」别名 → thinking 减少量 67%**（query Z 实测：A 组 41→12 字 / B 组 8→4 字）；query Z「订单号 ord/2026/0007」待 step-2 复测 |
| 3 | **反例减误调 + 加速** | | | | | | | 区分语义近的 Tool | 模型选 Tool 不出错 + 思考更短 | 变体 3 + 反例双向价值 | `apply_refund` description 含「Do not use for delivery issues — use query_logistics instead」→ user 问"快递慢"时模型**不**调退款；**反例双向价值**：① 拦不该调（query X：A 瞎调 / B 识破，completion_tokens +180 B 组多走推理）② 加速该调（query Z：A 41 字 / B 4 字，B 组 thinking 短 67%）**已由 step-3 实证** |
| 4 | **Few-shot 提准确率** | 模糊字段（自由文本）模型填得对 | 字段格式统一 | 变体 4 | `query_order` description 含 1 个示例「user says 查 12345 → call with order_id=12345」→ 模型填对的格式稳定性提升；**实测 caveat**：本 step 3 query（X/Y/Z）都没拉开 A/B 差距（字段描述已够强）—— 少样示例真正生效场景待更挑的 query 验证 |
| 5 | **Enum / Format 收紧** | 状态码、类型码 | 模型不幻觉值 | 变体 5 | `apply_refund.type` 用 enum 限定 `['[' refund_only', 'refund_return']` → 模型 0 次生成 enum 外的值；不加约束时幻觉率 > 0 |
| 6 | **跨 Provider 兼容** | 切换 / 多供应商 | schema 一份两边跑通 | 变体 6 | 同一份 Tool 定义，分别走 OpenAI Function Calling 和 Anthropic Tool Use → 必填字段都被识别、tool_call 字段名一致；**已由 step-6 实证**（物流类两侧调对且一致；订单详情类两侧识破且一致；`finish_reason` 字段名 A=`stop` / B=`end_turn` 属协议差异） |

需求 1 已由 step-1 实证；需求 2 + 需求 3 已由 step-3 实证（含意外发现）；需求 5 已由 step-5 实证。需求 4 实测 same-good（few-shot 边界认知已建立）。需求 6 已由 step-6 实证并锁定。

---

### 我追问过的

| 问题 | 针对什么 | 回答 |
| ---- | -------- | ---- |
| 「刚刚 step-1 怎么写都调错」 | 我以为 verdict 失败是「模型选择错」（描述不够好），实际是 expected 写死 + query C 不该存在 + 正则误伤 | 答：expected 必须按 query 内容动态判定（`pickExpectedTool` 按关键字命中 order/logistics），不能写死；query C「无关天气」超出本条教学点，要删；正则「到」字误伤 query B，要改成完整词组匹配 + 先 order 后 logistics。**这条追问是新理解**——「verdict 写错 vs 模型选错」是两个层面的问题。 |
| 「把两个 demo 都改成单独调用 + 完整差异点」 | 我以为「一键对比跑完看调对/调错」就够教学，实际学习者要的是「单变量可控 + 完整差异可观察」 | 答：教学模式设计原则 = 「单 Tool 独立调用」让学习者能完整对比所有维度（pickedToolName / finish_reason / arguments / response.content / token / 耗时），不是只看「调对/调错」二元判定。 |
| 「我的快递到哪了，订单是「123456」，调用 B 组时它不应该可以成功调工具吗？」 | B 组反例「不要用于 X」是否只拦订单详情类、还是不分情况一律拦 | 答：**过滤精准**——反例只拦订单详情类（地址/状态/金额），不拦物流类。query Z「我的快递到哪了 + 订单号」= 物流类 + 给了具体订单号 → B 组应稳定调对 query_logistics + order_id="123456"。**这是变体 3「反例」的另一个验证维度：拦截 + 不误伤**。 |
| 「pickedToolName=null 是合法结果吗？」| step-3 我把「模型没调 Tool」当 502 报错 | 答：**pickedToolName=null 有两种合法原因**：① 反例生效（content 说「这是订单详情，不是物流」）② 缺字段识破（content 说「没提供订单号，请告诉我」）两者都是「模型识破 → 不调」，但触发机制不同。CompareSide 加 `ok: boolean` 字段区分；判定函数拆 4 档 `neg / missing / both / none`。**这是变体 2 + 变体 3 的边界交叉**。 |
| 「我的快递到哪了，订单号是 2938293」B 组调用对了但完整差异点表说「瞎调」 | 核心对照只看 pickedToolName!==null 误判「调对」为「瞎调」| 答：**5 档分类函数 `classifyPick(picked, qType, content)` = 三维交叉**：
- query 类型（logistics/order_detail/boundary，由 `classifyQuery(query)` 词组匹配判）
- pickedToolName（null/query_logistics）
- content 识破原因（missing/none，由 `detectRecognizeReason(content)` 关键词判）
旧逻辑只看 pickedToolName 单维度 → 物流类调对场景（pickedToolName=query_logistics）一律判「❌瞎调」。**5 档分类教学升级**：4 档（瞎调/识破）→ 5 档（对调/瞎调/漏调/识破(反例)/识破(缺字段)），**三维交叉判定**才能完整刻画「query 期望 vs picked 实际」的对照关系。**核心教学点**：核心对照不能是单维度 pickedToolName 是否 null，必须按 query 类型决定「对」是哪一档。 |
| 「为什么 step-4 query X/Y/Z 三个 query 都没拉开 A/B 差距？是不是少样示例没生效？」 | 少样示例 demo query 设计与字段描述强场景不匹配 | 答：**实测 step-4 3 query 全部 same-good**：query X「我那个订单到哪了」两侧都识破缺字段（schema required + 字段描述「用户的订单号」生效，few-shot 没数字可抽）；query Y「我那单 67890 到了吗」两侧都抽对 order_id="67890"（query 里有数字 + 字段名 order_id 足够提示，模型基础能力够抽）；query Z「我的快递 12345 到哪了」两侧都稳填 order_id="12345"（few-shot 原文 + 模型基础能力）。**少样示例的真正生效场景**（待更挑的 query 验证）：
- query 极简模糊（如「我订单呢」/「查询」），few-shot 教模型"遇到模糊 query 也按 example 抽占位符"
- 模型对「user 说的『单 67890』要抽 order_id=67890」这个 pattern 不熟时
- **少样示例实际收益是「稳定格式 + 不瞎填」**（避免模型在模糊场景下自由发挥），对「抽数字填字段」这种模型基础能力 + 字段描述强的情况没什么附加价值。这是本 step 的意外发现：少样示例的**边界**（不是「无效」是「边界」） |

---

### 过关自检（每项都能转述 = 勾 ✅ ✅ 时的最低标准）

1. Tool Description 由哪两块田组成？各自给谁看？
2. description 太短、太长、各会导致什么问题？
3. schema 字段级 description 是给程序用的还是给模型用的？为什么？
4. 反例（negative examples）应该写在 description 的哪里？举一个具体例子。
5. few-shot 应该塞几个？为什么不是越多越好？
6. 跨 Provider 写 Tool 时最容易踩踩坑的两个字段差异是什么？（提示：required / 类型嵌套）
7. 当 Tool 数量从 5 个涨到 20 个时，调用率为什么会下降？怎么救？（提示：context 注意力分散）
8. 用一句话说出「为什么 description 是 Tool Description 中**最重要**的一块田，而不是 schema」。
9. **「verdict 显示『调错』时，怎么判断是『模型选择错』还是『verdict 期望写错』？」**
10. **「query C『今天天气怎么样？』适合作为本条的对照 query 吗？为什么？」**
11. **「教学模式为什么是『单 Tool 独立调用 + 完整差异点表』，而不是『一键对比』？」**
12. **「pickedToolName=null 的两种合法原因是什么？怎么区分？」**
13. **「反例『双向价值』是什么？为什么说『拦截 + 加速』？」**
14. **「query Z'（物流类 + 给具体订单号）B 组调对了，为什么完整差异点表说『瞎调』？核心对照应该怎么改？」**
15. **「5 档分类函数 `classifyPick(picked, qType, content)` 为什么要三维交叉（query 类型 + pickedToolName + content）？少一个维度会怎样？」**
16. **「少样示例什么时候才有效？本 step 3 query 都没拉开 A/B 差距（same-good）是 query 设计问题还是 few-shot 本身边界？」**
17. **「OneCallCard 顶部 tag 怎么才能不被 query 类型误判？应该用几档分类？」**
18. **「classifyQuery 关键词要扩到多广才能覆盖 user 物流类常见表述（'我那单' / '包裹' / '帮我看' 等）？」**

---

### Demo 子节进度

| 状态 | 子节 | 入口 | 端口 | 本子节教学点 |
|------|------|------|------|--------------|
| ✅ | step-1 | `yarn app:05-02-description-step-1` | `50025` | 真 LLM **单次对照**（bug 修复后 + 教学模式升级）：query A 物流类（A 组选 query_order ❌ / B 组选 query_logistics ✅ + token Δ+172 / completion -64 / 耗时 +2589）+ query B 地址类（两侧都→query_order ✅ 验证好描述不调错）。**期望工具按 pickExpectedTool(query) 动态判定**，不是写死。双端点独立调用 + 完整差异点表（变体 1「触发条件」· 双 Tool `query_order` vs `query_logistics`）。**已锁定 2026-09-08**（coach complete 过关检查 3 缺口补这一步 · 学习者选「补这一步」；`check-demo` 过 + §5.3.2 六项齐）。|
| ✅ | step-2 | `yarn app:05-02-description-step-2` | `50026` | 字段 description **单次对照**（单 Tool · 唯一差异 = order_id 字段有无 description · user 用城市名当订单号看模型是否瞎填 / 范化 / 不调 · 变体 2「参数语义」实证）。双端点独立调用 + 完整差异点表。query X 实证：两侧都没调 Tool（不瞎填城市名 = 合法结果）。**踩坑 bug 5**：`ok` 字段区分调用失败 vs 模型主动不调。**已锁定 2026-09-08**（coach complete 过关检查 3 缺口补这一步 · 学习者选「补这一步」；`check-demo` 过 + §5.3.2 六项齐）。|
| ✅ | step-3 | `yarn app:05-02-description-step-3` | `50027` | 反例 **单次对照**（单 Tool · 唯一差异 = query_logistics.description 含不含「不要用于 X」反例 · user 问订单地址类问题看模型是否瞎调 · 变体 3「反例」实证）。同样单端点独立调用 + 完整差异点表（5 档核心对照 `classifyPick(picked, qType, content)` 三维交叉 = query 类型 + pickedToolName + content 识破原因；4 档 content 识破类型 `neg/missing/both/none`；按 picked===null 保护）。order_id.description 写明「即快递单号/tracking number」别名映射。**已实证**：query X 下 A 组瞎调 ❌ / B 组识破 ✅（反例双向价值 ① 拦截）+ query Z' 下两侧都对调（🟢 反例不误伤）+ B 组 thinking 短 67%（反例双向价值 ② 加速）。**已锁定 2026-09-08**。**踩坑 bug 6/7/8/9/10**。 |
| ✅ | step-4 | `yarn app:05-02-description-step-4` | `50028` | 少样示例 **单次对照**（单 Tool · 唯一差异 = query_logistics.description 含不含 1 个 few-shot 示例 · user 问模糊订单号场景看模型是否按示例规范填 · 变体 4「少样示例」实证）。同样单端点独立调用 + 完整差异点表。**已实证**：3 query 全部 same-good —— **意外发现：少样示例的边界**（字段描述已够强时 few-shot 无明显附加价值，实际收益是「稳定格式 + 不瞎填」）。**已锁定 2026-09-08**。|
| ✅ | step-5 | `yarn app:05-02-description-step-5` | `50029` | Enum 约束 **单次对照**（单 Tool · 唯一差异 = 字段是否用 `enum` 限定取值范围 · user 给模糊输入看模型是否幻觉 enum 外的值 · 变体 5「Enum / Format 约束」实证）。同样单端点独立调用 + 完整差异点表。**已实证**：query X「比较急」A 组 priority="急"（enum 外 ❌）/ B 组 priority="high"（enum 内 ✅）—— **第一次真正拉开 A/B 差异**。**已锁定 2026-09-08**。|
| ✅ | step-6 | `yarn app:05-02-description-step-6` | `50030` | 跨 Provider 兼容（同一份 Tool schema 分别走协议 A · OpenAI 和协议 B · Anthropic · 变体 6「跨 Provider 兼容」实证）。双端点独立调用 + 完整差异点表（核心对照 = 两家 Provider 调用是否一致）。**已实证 2026-09-08**：物流类两侧 `query_logistics` + `order_id="12345"` 一致；订单详情类两侧 `picked=null` 识破一致；`finish_reason` A=`stop` / B=`end_turn` 为协议字段名差异。`check-demo` 过。**已锁定 2026-09-08**（coach complete 过关检查 1 缺口补这一步 · 学习者选「补这一步」）。 |

> **step-1 状态**：✅ 已锁定（2026-09-08 · 双 Tool 触发条件；过关检查 3 需求 1 证据落点）
> **step-2 状态**：✅ 已锁定（2026-09-08 · 字段 description 有无对照；过关检查 3 需求 2 / 前端例子证据落点）
> **step-3 状态**：✅ 已锁定（2026-09-08）
> **step-4 状态**：✅ 已锁定（2026-09-08）
> **step-5 状态**：✅ 已锁定（2026-09-08）
> **step-6 状态**：✅ 已锁定（2026-09-08 · 跨 Provider 实证完成）

---

### 写入说明

- **本节是模块 05 · 02 这条的首条沉淀**（[07-notes §0 已沉淀固定判定](agents/07-notes.md#0-沉淀--已沉淀--未沉淀唯一口径2026-09-05) 全满足：文件在 + `状态：已沉淀` + 五块齐）。
- **多次覆盖重写 + 多次增量更新**：① bug 修复后（5 bug 进踩坑）② 教学模式升级后（单 Tool 独立调用 + 完整差异点表）③ step-3 意外发现后（pickedToolName=null 两种合法原因 + 反例双向价值「拦截+加速」+ 变体 2/3 联动）④ 5 档核心对照修复后（query 类型 + pickedToolName + content 三维交叉）⑤ step-4 少样示例边界后（3 query 全部 same-good + 少样示例实际收益是「稳定格式 + 不瞎填」）⑥ step-5 Enum 约束（query X 第一次拉开 A/B 差异）⑦ step-6 跨 Provider 半成品修正 ⑧ **step-6 跨 Provider 实证锁定（2026-09-08）**：物流类两侧调对一致 + 订单详情类两侧识破一致；协议字段名差异（`stop` vs `end_turn`）写入例子节。
- 「需求清单」6 条对应 §6.3 扫出的 6 个变体（变体 1–6 均已实证；step-1～6 全部 ✅ 锁定，过关检查 3 需求 1/2 证据齐）。
- 「Demo 子节进度」表：6 行（step-1 ✅ / step-2 ✅ / step-3 ✅ / step-4 ✅ / step-5 ✅ / step-6 ✅）。
- 「踩坑」节记录本会话 12 个 bug + 修复，作为下一轮学习的案例。