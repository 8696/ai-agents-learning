# **JSON Schema**：类型、optional、enum；Zod 和 Schema 的关系

> 对应模块：[模块 04 · Structured Output ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 1 条

- **来源**：本对话主讲（聊到 `apps/04-Structured-Output/01-JSON-Schema-step-1/`） · [json-schema.org](https://json-schema.org) · [Zod v3](https://zod.dev)
- **状态**：Demo 已落 / 沉淀首次写满 + 增量 #1（2026-09-03）· 待勾 ✅
- **Demo**：`apps/04-Structured-Output/01-JSON-Schema-step-1/`（CLI，可在终端跑 `yarn app:04-01-json-schema-step-1`；不调 LLM API）· 详见 §5.2 Demo 判断块

> 各节写什么、怎么判断归哪一节、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。

### 是什么

**JSON Schema** 是一份 JSON 形态的"数据形状说明书"——它本身是一段 JSON，描述另一段 JSON 应该长什么样：有哪些字段、每个字段什么类型、哪些必填、哪些可选、枚举值是哪几个、嵌套多深、能不能是 null。
- 官方：[json-schema.org](https://json-schema.org)。主流版本 **Draft 2020-12**；除非工具明示要 Draft-07，否则默认 2020-12。
- 不是 LLM 概念，是 2010 年前后的 Web 标准。API 文档、SDK、消息队列、事件契约都靠它。

**Zod** 是 TypeScript 写的声明式校验库——链式 API 定义 schema，**一次做三件事**：(1) 运行时校验；(2) `z.infer` 推导 TS 类型；(3) 自动生成错误信息。
- `npm i zod`；TS ≥ 4.7；本仓库装的是 `^3.24.2`。
- 关键用法：`z.parse`（成功返回 typed 对象，失败抛 `ZodError`）、`z.safeParse`（永不抛，返回 discriminated union）、`z.transform`（校验后改结构）、`z.infer<typeof X>`（拿 TS 类型）。

### 为什么（Agent 开发要懂）

Agent 项目里模型的输出是自由文本，要变成"程序能处理的数据"只有一条稳定路径：先**声明 schema** → 让模型**按 schema 输出** → 服务端**按 schema 解析**。学歪的 4 个具体后果：

1. **字段漂移**。让模型"返回一个 JSON"，它会丢字段、改大小写、把字符串塞进数字字段——下游 `user.profile.age × 100` = `NaN`，整链炸。schema 是"协议"不是"建议"。
2. **缺类型安全**。手撸 interface 撑不到第二次改动；schema 一变，下游 if/else 全部要重写。`z.infer` 自动推，下游零改动。
3. **复杂结构 prompt 写不动**。"如果有嵌套对象、数组、枚举"——prompt 写三段中文规则模型记不全，schema 一行 `enum` 就把模型锁死。
4. **跨语言接口对不齐**。OpenAI / Anthropic 的 structured outputs / tool use 收的是 **JSON Schema**；服务端内部用 **Zod** 解析。中间一定要会转换，不能只会其中一头。

### 易混点

| 易混对 | 差在哪 | 判错会怎样 |
| --- | --- | --- |
| **JSON Schema vs TS 类型** | TS 类型在编译期生效、运行时就消失；JSON Schema 是一段 JSON 数据，运行时真去校验 | 写完 `interface User` 就以为稳了，运行时照样炸字段 |
| **JSON Schema vs Zod** | 一个数据格式 / 一个 TS 库；JSON Schema 跨语言，Zod 是 TS 单一来源 | 用 Zod 喂给 OpenAI（不认）→ 用 JSON Schema 在 TS 里校验（要绕一圈） |
| **`required` 默认极性**（JSON Schema） | 全可选 + `required: [...]` 升格才必填 | 以为"列在 properties 里就必填" → 缺字段校验照样过 |
| **`.optional()` 默认极性**（Zod） | 全必填 + `.optional()` 才允许缺 | 以为"不写就是可选" → 跑起来全报错 |
| **`enum` vs `const`** | `enum` 是 N 选 1 集合；`const` 钉死一个值 | 想钉一个值却写成 enum、写完又往里加 → 协议漂移 |
| **`type` 写法 vs `.nullable()`** | JSON Schema 用 `type: ["string","null"]`；Zod 用 `.nullable()` | 写法抄反 → 一边过一边不过 |

> **预告刺**：下一条 `02 JSON Mode vs Structured Output` 会专门拆清"我把你这份 schema 喂给模型，模型到底**多**守规矩"——本条不展开。

### 例子

#### 通俗例子（每个核心对象一个）

| 核心对象 | 通俗例子 |
| --- | --- |
| **类型 (`type`)** | 体检表"血压"格子只填数字 120/80，写"正常"医生一头雾水——`type` 就是告诉程序"这格只准数字" |
| **optional / required** | 酒店入住登记"姓名 + 身份证号"必填、"车牌号"可不填（步行来的人没车）——`required` 就是那张红字"必填"清单 |
| **enum** | 自助餐饮料机按"可乐 / 雪碧 / 芬达"——按钮物理上不许出第四种。`enum` 给模型装同样的按钮盘，乱编一个"美年达"立刻报错 |
| **Zod** | 工厂流水线末端的"质检仪"——产品过逐项卡（长度、重量、印刷、颜色），合格放行、不合格标红返工 |
| **Zod ↔ JSON Schema** | "施工图纸"vs"实体建筑"。图纸（JSON Schema）人人能看（跨语言），实体建筑（Zod 在 TS 里运行）实际占地 |

#### Zod 调用返回值（6 段，对应 `apps/04-Structured-Output/01-JSON-Schema-step-1/index.ts` 跑出来的样子）

**① `parse(data)` — 成功返回 typed 对象，失败抛 `ZodError`**

```ts
const ok = User.parse({ name: "alice", age: 30 });
// ok = { name: "alice", age: 30 }
// TS 推断 ok: { name: string; age: number }
```

失败抛出的 `ZodError` 形状：

```ts
// err.issues = [
//   {
//     code: "invalid_type",
//     expected: "string",
//     received: "number",
//     path: ["name"],
//     message: "Expected string, received number"
//   },
//   ...
// ]
```

两条关键：`issues` 是**数组**（一次校验多个错全列）；每条带 `path`（错在哪个字段，嵌套时是数组路径）。

**② `safeParse(data)` — 永不抛，返回 discriminated union**

```ts
type SafeParseReturn<T> =
  | { success: true;  data: T }
  | { success: false; error: ZodError };
```

`if (!r.success) { r.error.issues }` 让 TS 在 false 分支自动 narrow 出 `error`，true 分支 narrow 出 `data`。

**③ `z.infer<typeof Schema>` — 拿 TS 类型**

```ts
const User = z.object({
  name:     z.string(),
  nickname: z.string().optional(),
  tags:     z.array(z.string()).default([]),
});
type User = z.infer<typeof User>;
// { name: string; nickname?: string | undefined; tags: string[] }
```

`optional()` → `tags?: T | undefined`；`default([])` → `tags: T[]`。两者并用时**默认值优先**（运行时一定拿到数组）。

**④ `enum` / `default` / `transform`**

```ts
const Order = z.object({
  status: z.enum(["pending", "paid", "cancelled"]).default("pending"),
  total:  z.number(),
}).transform((o) => ({ ...o, totalInCents: Math.round(o.total * 100) }));
Order.parse({ items: ["x"] }).status;   // "pending"（default 补的）
```

`transform` 会**改 `infer` 出的类型**（输出 ≠ 输入）。

**⑤ ZodError 处理 + repair loop（Agent 最常用形态）**

模型吐的 JSON 不合 schema，把 `issues` 拼回 prompt 让它修：

```ts
const repairPrompt =
  "上一次的输出不符合 schema，错误：\n" +
  r.error.issues
    .map(i => `  - ${(i.path as (string|number)[]).join(".") || "(root)"}: ${i.message}`)
    .join("\n") +
  "\n请重新输出合法 JSON。";
```

Zod 报错信息**天然是给模型吃的**——`path + message` 比手撸字符串稳定得多。**JSON Schema 模块的"闭环"**：(1) 给模型 JSON Schema 限制它怎么吐 → (2) 收回来用 Zod safeParse 验 → (3) 失败拿 issues 让模型改。

**⑥ 端到端最短能跑（不调 API）**

```ts
const Intent = z.object({
  action: z.enum(["search", "order", "cancel"]),
  query:  z.string().min(1),
  qty:    z.number().int().positive().optional(),
});
const r = Intent.safeParse(JSON.parse(modelOutput));
if (!r.success) { console.error("❌", r.error.issues); process.exit(1); }
console.log("✅", r.data);  // r.data.action 类型 narrow 到 "search"|"order"|"cancel"
```

跑一下能直接看到返回值就是普通 TS 对象，下游 `switch(r.data.action)` 不需要 any。

#### ⑦ Zod 一次给三件事（追问补入）

> 来自「zod 不仅可以动态推导 ts 类型还可以校验？」这一问——把"一份 schema 同时给三件"用最小代码 + 生活比喻说透。

| 能力 | 在哪发生 | 怎么用 |
| --- | --- | --- |
| **运行时校验** | Node 进程里 | `Schema.parse(input)` / `Schema.safeParse(input)` |
| **编译期 TS 类型推导** | `tsc` 看你的代码时 | `type X = z.infer<typeof Schema>` |
| **错误信息生成** | 校验失败那一刻 | `error.issues[i].path + message`，天然可喂给模型做 repair |

最小代码（同一段 schema，三件事一起演示）：

```ts
const Cat = z.object({
  name: z.string(),
  age:  z.number().int().positive(),
});

// ① 运行时：这张"卡尺"真的去卡
Cat.parse({ name: "Mia", age: 3 });   // ✓ → { name: "Mia", age: 3 }
Cat.parse({ name: 42 });              // ✗ → 抛 ZodError，issues 数组里有 path=["name"]/code/message
Cat.safeParse({ name: 42 });          // ✓（不抛）→ { success: false, error: ZodError }

// ② 编译期：同一张"图纸"给 tsc 读
type Cat = z.infer<typeof Cat>;       // { name: string; age: number }
//    ↑ 下游 cat.name IDE 自动补全；switch(cat.age) 范围会自动 narrow
```

**怎么做到"一份定义、两端使用"**：Zod 的 schema 是**一个普通 JS 值**（工厂函数调出来的对象），它的形状被 TS 写得很精确，`typeof Schema` 自己就能当类型源；`z.infer` 只是把那个精确类型摊出来。所以：

- **运行时** 拿到的是个真函数对象，可以 `.parse()` 它。
- **编译期** 拿到的是个类型，可以通过 `typeof` + `z.infer` 反推出来。

**生活比喻（量表）**：体检的"量表"——量表本身既是**卡尺**（运行时校验），也是 TS 编译器看的**图纸**（编译期类型推导），附带**报错模板**（不通过时报哪一项什么不达标）。不是三份独立文档，是同一张表被三个角色各取所需。

**回应提问的潜台词**：传统做法是 `interface Cat` + 一份独立的 validator 库（joi / ajv / yup）——两份代码，必须自己保证不漂移。Zod 把这俩绑成同一个值，**改了 schema 两边自动同步**。这就是为什么 §取舍 里强调"以 Zod 为单一事实来源、`zod-to-json-schema` 派生喂给模型"——LLM API 那一头吃的也是同一份契约，不是另一份。下一条 02 会把"喂给模型的 JSON Schema"和"服务端 Zod 校验"两边打通成闭环。

#### 同一份契约的两种写法对比

| 维度 | JSON Schema（手写 / `zod-to-json-schema` 派生） | Zod |
| --- | --- | --- |
| 形态 | 一段 JSON 数据 | 一段 TypeScript 代码 |
| 跨语言 | ★★★（任何语言都能读、能校验） | ★（只在 TS/JS 里跑） |
| 编译期类型 | ✗ | ★★★（`z.infer` 推 TS 类型） |
| 谁消耗 | HTTP API、OpenAI、MCP、消息队列 | 服务端验证、配置校验、测试数据 |
| Agent 场景位置 | **入口**：喂给模型 | **出口**：模型吐回来后解析 + 校验 |

### 我追问过的

- **「举几个例子，这个库的调用的返回值是什么」** → 给了 6 段 Zod 调用返回值（`parse` / `safeParse` / `z.infer` / `enum+default+transform` / repair loop / 端到端），把 `ZodError.issues` 的 `path | code | message` 形状摊开看。
- **「写demo」** → 强制出 Demo，覆盖原预告的"伪代码（见机制），不写 Demo"。改判为"可运行 CLI（不调 API）"，落到 `apps/04-Structured-Output/01-JSON-Schema-step-1/`。
- **「沉淀稳定」** → 走首次写满路径，把以上全部写进这份 MD。
- **「zod 不仅可以动态推导 ts 类型还可以校验？」** → 用最小代码 (`Cat` schema 一段带出 `.parse` / `.safeParse` / `z.infer`) + 量表比喻（同一张表被卡尺 / 图纸 / 报错模板三角色各取）把"一份 schema 同时给三件事"补到「例子」§⑦。已并入增量 #1。

### 取舍

| 场景 | 用什么 | 理由 |
| --- | --- | --- |
| 喂 LLM（OpenAI / Anthropic structured outputs / tool use） | **JSON Schema** | SDK 只认这个；所有 prompt / SDK 文档示例都是 JSON Schema 形态 |
| 服务端 TS 代码内解析 + 校验 | **Zod** | `z.infer` 拿 TS 类型；`safeParse` 永不抛；`transform` 改结构 |
| 配置 / 环境变量 | **Zod** | TS 单一来源 + 错误信息清晰 + `z.coerce` 转换类型 |
| 跨系统事件契约 / SDK 公开 API | **JSON Schema** | 跨语言、SDK 自动生成、文档可视化 |
| 本仓库的 Schema 维护策略 | **以 Zod 为主，`zodToJsonSchema` 派生** | 一份事实来源；改一处全链路自动同步 |

### 踩坑

- 用 `JSON.parse` + 正则裸解析模型输出，没有 Schema 校验层。**模型字段漂移是常态**，不是例外。
- 把 Zod 的 optional 默认极性（默认全必填）代入 JSON Schema（默认全可选），反之亦然。两边各踩一半。
- 写一份 `interface User` 当 schema——TS 类型在编译期消失，运行时没人校验，模型字段一改就炸。
- Zod schema 改了但**没**重新喂给模型一份 JSON Schema → 喂的是过时版本，模型按旧版本吐，回来对不上。
- 把 `zod-to-json-schema` 派生出来的 JSON Schema 手工改一部分——两份 schema 漂移是必然。

### 过关自检

> 目标：「能读一份 Schema，知道必填 / 枚举」+ 围绕 §6.2 全套要求的最小自测。

1. 拿到一段 JSON Schema，问自己：(a) `type` 决定了什么？(b) `required` 之外的字段是什么状态？(c) `enum` 怎么写、跟 `const` 差在哪？
2. 拿到一段 Zod 代码，问自己：(a) 哪些字段在 `z.infer` 后会带 `?`（optional）？(b) `.default(x)` 跑出来的对象必有什么？(c) `transform` 影响 `z.infer` 的哪个方向？
3. 用文字写出「给模型 JSON Schema → 模型吐 → 服务端 Zod 解析 → 失败拼 repair prompt → 让模型改」的 5 步闭环，每步标 Zod 还是 JSON Schema 那一端。
4. 给一段故意不合规的 JSON 数据，写出 `safeParse` 返回值的两种形态，并解释为什么 `if (r.success)` 之后访问 `r.data` 是类型安全的。
5. 把一个故意带 `ZodError` 的 `error.issues` 数组，翻译成"给模型吃的 repair prompt 字符串"。要带 `path` + `message`，不可漏字段。

### 还没搞懂的

- JSON Schema **Draft 2020-12 vs Draft-07** 在 LLM SDK（OpenAI / Anthropic）实际接受的字段差异。**目前默认 2020-12**；碰到 SDK 报错再回查具体 Provider 的版本要求。
- `zod-to-json-schema` 对**递归 / refine / 复杂 union** 不支持时的回退方案——绝大多数简单 schema 没问题，碰到再查。
- 多 schema 项目的 `$ref` / `$defs` 组织模式（单一 schema 文件 vs 分文件 + 引用）。**下一模块 09 RAG 进阶 / 14 Multi-Agent** 大概率会碰到。
- 8 种 primitive 类型 vs OpenAI / Anthropic 实际允许的字段子集差异（特别 `null` / `integer` / `format` 的支持度）。
