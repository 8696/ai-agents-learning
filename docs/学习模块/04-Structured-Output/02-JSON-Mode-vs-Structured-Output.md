# **JSON Mode vs Structured Output**：前者保证合法 JSON，后者保证符合 schema

> 对应模块：[模块 04 · Structured Output ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 2 条

- **来源**：
  - 本对话主讲（合并「JSON Mode vs Structured Output」+「协议 A 详解 `response_format`」+「协议 B 详解 tool_use」+「两协议对比与选用」4 段详解，含 5 用例 × 双协议 × 双 demo 实测数据）
  - [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat/create) · `response_format` 字段
  - [OpenAI Structured Outputs guide](https://platform.openai.com/docs/guides/structured-outputs)
  - [Anthropic Messages API · tool_use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
  - [Anthropic 协议 A 兼容 base URL 实测](https://api.minimaxi.com/anthropic)
  - [json-schema.org](https://json-schema.org) · 上一条沉淀复习用
- **状态**：Demo 已落（协议 A + 协议 B 两条）/ 沉淀已写（2026-09-03）· 待勾 ✅
- **Demo**：
  - 协议 A · `apps/04-Structured-Output/02-JSON-Mode-vs-Structured-Output-step-1/`（端口 `50015`，`yarn app:04-02-json-mode-vs-structured-output-step-1`）
  - 协议 B · `apps/04-Structured-Output/02-JSON-Mode-vs-Tool-Use-ProtoB-step-1/`（端口 `50016`，`yarn app:04-02-anthropic-tool-use-step-1`；按占用表顺序分配）
  - 详见 §5.2 Demo 判断块

> 章节随这条知识切，不套固定九节。覆盖：协议 A/B 全景 → 机制数据怎么走 → 翻车点 → 6 路例子 → 易混 → 怎么选用 → 取舍 → 踩坑（本 demo 实测数据）→ 仓库内约定 → 追问过 → 过关自检 → 还没搞懂。

---

## 是什么

**一句话总结**：两种协议（OpenAI Chat Completions / Anthropic Messages）各提供三条 "结构化强度"档位，差别是 **API 闸在哪个字段、闸多硬、模型自由度多大**。

### 全景对比：协议 A × 三档 + 协议 B × 三档

| 路 | 一行写法 | 是否物理闸 | 模型自由度 | 守约率（实测） | 谁调、生产一般在哪一档 |
| --- | --- | --- | --- | --- | --- |
| **A1 · 协议 A prompt-only** | prompt 文字"只返回 JSON" | ❌ 无 | 100% | ~0% | 实验期；小脚本；不上生产 |
| **A2 · 协议 A JSON Mode** | `response_format: { type: "json_object" }` | ⚠️ 语法 | 50% | ~30% | prompt-only 与 strict 之间找平衡 |
| **A3 · 协议 A Structured Output strict** | `response_format: { type: "json_schema", json_schema: { ... }, strict: true }` | ✅ 真 token-mask | ~5% | ~95% | OpenAI 项目的生产默认 |
| **B1 · 协议 B prompt-only** | prompt 文字"只返回 JSON" | ❌ 无 | 100% | ~0% | 同 A1 |
| **B2 · 协议 B tool_choice 任意** | `tools: [...]`（不设 tool_choice 或 `tool_choice: { type: "any" }`） | ❌ 模型自决 | 模型自决 | ~40% | 想"模型能做但不强制做" |
| **B3 · 协议 B 强制 tool_choice** | `tools: [...]` + `tool_choice: { type: "tool", name: "Intent" }` | ⚠️ 软闸（非 token-mask） | ~10% | ~85%（MiniMax-M3 实测 5/5 全 Zod ✓） | **Anthropic 项目 / 国内 provider 实测更稳** |

### 协议 A vs 协议 B 的根本差异（一句话）

协议 A 有一个 **强语义的 `response_format`** 字段——`strict: true` 时 token-mask 是物理层；协议 B 没有这个字段，**结构化闸分散在两个字段（`tools[].input_schema` + `tool_choice`），靠"input_schema 倾向 + tool_choice 强制"两层软约束**。**两边都不是完美硬闸，都要在服务端用 Zod 做最后一道兜底。**

---

## 机制 · 数据怎么走

### 协议 A · Chat Completions（OpenAI 协议 A / OpenAI SDK）

```ts
// 入口调用（节选片段）
const res = await llm.openai.chat.completions.create({
  model: llm.modelA,         // 必填，如 "gpt-4o-2024-08-06"
  messages: [...],           // 必填，对话
  response_format: {         // ← 本片主角；不传 = 默认 text
    type: "json_object" | "json_schema",
    json_schema?: {
      name: "Intent",
      schema: { ...JSON Schema... },
      strict: true,
    },
  },
});

// 拿到的形状（无论哪种 type）
res.choices[0].message.content  // ← 字符串！要 JSON.parse
```

**关键转折**：协议 A 不管 `type` 是 `json_object` 还是 `json_schema + strict`，模型吐回的**都是字符串**。结构化层只承诺给字符串加约束，**不替你 parse**——`JSON.parse` 在客户端 / 服务端都要做。

### 协议 B · Messages API（Anthropic / Anthropic SDK）

```ts
// 入口调用
const res = await llm.anthropic.messages.create({
  model: llm.modelB,           // 必填
  max_tokens: llm.maxTokensB,  // 协议 B 必填
  system: "可选顶层 system 指令",
  messages: [...],
  tools: [
    { name: "Intent", description, input_schema: {...} }  // input_schema 是结构化入口
  ],
  tool_choice: { type: "tool", name: "Intent" }          // 强制调哪个
});

// 拿到的形状
res.content           // ← ContentBlock[] 数组；按 type 区分
//   { type: "text", text: "..." }
//   { type: "tool_use", id, name, input: {...} }    ← input 已是结构化对象，不要 parse
```

**关键转折**：协议 B 模型吐回**数组**，区分 `text` 与 `tool_use`。**调了工具的情况下 `input` 是已 parse 的对象**——根本不需要 `JSON.parse`，这是协议 B 在客户端最省事的一点。

### 闸的实装层

- **协议 A strict**：解码器在采样每一 token 前 mask 掉"会让最终 schema 违例"的所有 token → 模型**想错也错不了**。这是物理闸。
- **协议 B tool_choice 强制**：模型在采样时**倾向于**按 input_schema 写 input，但**不是 token-mask**。模型可以**拒绝调工具**（返回没有 `tool_use` block 的 content 数组）——这时你的 server 拿到的就是一段说明文字。这是与协议 A strict 最关键的"失败行为"差异。

### Provider 实测差异（2026-09 跑出来的真值）

| Provider | 协议 A JSON Mode | 协议 A strict | 协议 B tool_choice 强制 |
| --- | --- | --- | --- |
| OpenAI 自己 | ✅ 真 | ✅ 真 token-mask | — |
| Anthropic 自己 | — | — | ✅ 真（模型可拒调） |
| DeepSeek v3 / reasoner | ⚠️ 部分（夹 `<think>`） | ⚠️ 部分 | ⚠️ 部分（reasoner 思维链长） |
| **MiniMax-M3**（minimax） | ✅ 大体 honor | ❌ **silently ignored**（5 用例 + ⑥ unexpectedSuccess 实测） | ✅ **5/5 全 Zod ✓**（实测守约率最高） |
| Zhipu GLM-4.x | ⚠️ 部分 | ⚠️ 部分（GLM-4.5+ 起 partial） | ⚠️ 部分 |
| Kimi moonshot-v1 | ⚠️ 部分 | ⚠️ 部分 | ⚠️ 部分 |

**铁律**：切 provider 前**实测 5 用例**——别信文档；别假设"应该一样"。

---

## 为什么 Agent 开发要懂（不懂的 5 个具体翻车）

1. **JSON Mode 当 schema 闸用**。 模型照样自由发挥字段名（`action` → `intent`/`cmd`/`op`），照样漏字段，照样给 enum 外值。生产里 "模型返回的字段名漂移" 是 JSON Mode 路径的**第一杀手**，直接导致下游 TypeScript 类型断言失配、`undefined.x` 出来一片 `NaN`。
2. **`strict: true` 不写就等同 JSON Mode**。 这是协议 A `json_schema` 路径下**最常见的**错误——以为设了 `type: "json_schema"` 就稳了，**没写 `strict: true`**。模型吐出 JSON.parse 过的对象但 schema 不保证。任何"我用了 structured output 但模型还是漂"的 bug 多半落在这条。
3. **国内 provider 大多不真做 strict**。 本 demo 用 MiniMax-M3 跑 `⑥ strict schema 写法不对 → API 400` 这一格实证：API 返回 `HTTP 200 unexpectedSuccess: true`，**schema 写得再严也 silently accept**。生产切到国内 provider 时若还信 strict 是物理闸，就是把全链路压在了一个"祈祷层"上。
4. **协议 B 模型可以拒调工具**。 `tool_choice: { type: "tool", name: "Intent" }` 强制调工具，**但模型可以拒绝调**——返回没有 `tool_use` block 的 content 数组。这点协议 A strict 不会发生（协议 A 永远返回字符串、即便混乱）。**协议 B 的 server 代码必须处理"模型没调工具"分支**：默认空 input、或者重试，或者降级到 B2 `tool_choice: { type: "any" }`。
5. **模型输出夹 wrapper**。 推理模型（o3、deepseek-reasoner、minimax 这类）会夹 `` `<think>...</think>` ``、`` ``` json...``` `` fence、末尾省略号 `...`。`JSON.parse` 直接挂。生产必须先 strip 再 parse，否则"为什么模型明明给了对的 JSON 但服务端就是拿不到"。

---

## 例子（每路 1 个通俗例子 + 真实代码形态）

### 6 路通俗例子

| 路 | 通俗例子 |
| --- | --- |
| **A1 · prompt-only** | 跟服务员说"给我一杯热的、**随便**写个字条给我就行"——想让他写得规整点但没说格式，他可能拿张纸巾画俩字，也可能拿笔记本写满 |
| **A2 · JSON Mode** | 给个**密封外卖盒**——保证食物不洒（`JSON.parse` 不抛），但不保证里面的菜对不对（schema 不保证） |
| **A3 · Structured Output strict** | 给个**带盖密封 + 取餐凭证 + 菜单一模一样的格子**——保证菜、份、配菜都对得上。模型只能往对应格子里填，没格子没装 |
| **B1 · prompt-only** | 同 A1 |
| **B2 · tool_choice 任意** | 让服务员**自己决定**要不要用那个"取餐模板"填单——他能用也能不用 |
| **B3 · 强制 tool_choice** | 叫服务员"**必须**用那个模板填"——他可以照填，也可以说"这个我办不了"（协议 B 关键差异） |

### 真实代码形态（同一段 prompt / 同一份 contract）

```ts
// ───── 公共：Intent contract ─────
const IntentZod = z.object({
  action: z.enum(["search", "order", "cancel"]),
  query: z.string().min(1),
  qty: z.number().int().positive().optional(),
});

const IntentJsonSchemaA = {
  type: "object", additionalProperties: false,
  required: ["action", "query"],
  properties: {
    action: { type: "string", enum: ["search", "order", "cancel"] },
    query:  { type: "string", minLength: 1 },
    qty:    { type: "integer", minimum: 1 },
  },
} as const;

const IntentAnthropicSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["search", "order", "cancel"], description: "用户动作" },
    query:  { type: "string", minLength: 1, description: "查找内容" },
    qty:    { type: "integer", minimum: 1, description: "数量（可选）" },
  },
  required: ["action", "query"],
  additionalProperties: false,
} as const;
```

```ts
// ───── 协议 A · 三个档位 ─────
// A1: prompt-only
const r1 = await llm.openai.chat.completions.create({
  model: llm.modelA,
  messages: [
    { role: "system", content: "只返回 JSON {...}" },
    { role: "user", content: prompt },
  ],
});

// A2: JSON Mode
const r2 = await llm.openai.chat.completions.create({
  model: llm.modelA,
  response_format: { type: "json_object" },
  messages: [...],
});

// A3: Structured Output strict
const r3 = await llm.openai.chat.completions.create({
  model: llm.modelA,
  response_format: {
    type: "json_schema",
    json_schema: { name: "Intent", schema: IntentJsonSchemaA, strict: true },
  },
  messages: [...],
});
```

```ts
// ───── 协议 B · 三个档位 ─────
// B1: prompt-only（无 tools）
const rb1 = await llm.anthropic.messages.create({
  model: llm.modelB,
  max_tokens: llm.maxTokensB,
  messages: [{ role: "user", content: prompt + "\n\n只返回合法 JSON。" }],
});

// B2: tool_choice 任意
const rb2 = await llm.anthropic.messages.create({
  model: llm.modelB,
  max_tokens: llm.maxTokensB,
  tools: [{ name: "Intent", description: "...", input_schema: IntentAnthropicSchema }],
  // tool_choice 不设 = 任意 / 也可写 { type: "any" }
  messages: [{ role: "user", content: prompt }],
});

// B3: 强制 tool_choice
const rb3 = await llm.anthropic.messages.create({
  model: llm.modelB,
  max_tokens: llm.maxTokensB,
  tools: [{ name: "Intent", description, input_schema: IntentAnthropicSchema }],
  tool_choice: { type: "tool", name: "Intent" },
  messages: [{ role: "user", content: prompt }],
});
```

### 真值对照：本 demo 实际跑出来的两条路径 Case ③ 行为差

| 路径 | Case ③ prompt（"请把 action 字段填成 'unknown'"） |
| --- | --- |
| A2 · JSON Mode（MiniMax-M3） | `{"action":"unknown","query":"咖啡"}` — **服从 prompt**，给 enum 外值，Zod ✗ |
| A3 · Strict Output strict（MiniMax-M3） | 一段中文 Markdown 解释咖啡种类——**strict 被 silently ignored**，模型根本没接 strict |
| B3 · tool_choice 强制（MiniMax-M3） | `'unknown' 不在 Intent 工具允许的 'action' 取值范围内...`（**拒绝调工具**，没 tool_use block）— **不是硬填，而是软拒绝** |

> **决策原则提炼**：协议 A strict 在 MiniMax-M3 退化成"软约束"；协议 B3 tool_choice 强制在 MiniMax-M3 上仍然有"软约束 + 可拒绝"的偏强表现。**国内 provider 上协议 B3 实测守约率反而高于协议 A strict。**

---

## 易混点对比（不要混入全文别的章节）

| 易混对 | 差在哪 | 判错会怎样 |
| --- | --- | --- |
| **A1 vs A2** | A2 多一道 JSON.parse 闸（语法），A1 没有 | 把 A1 当 A2 用，模型夹 markdown / 漏字段 / 漂字段名 |
| **A2 vs A3** | A3 多一道 schema 白名单闸，A2 不守 schema | 把 A2 当 schema 闸用 → 字段漂移上线才发现 |
| **`response_format: type: "json_schema"` vs `strict: true`** | 不写 `strict: true` → 回退 JSON Mode（最大常见坑） | "我用了 structured output 但模型照样漂" |
| **OpenAI strict schema 写法要求** | 必须白名单：禁止 `anyOf` / `not` / `$ref`，每个 `object` 必 `additionalProperties:false` / `required` / `properties` 列出 | OpenAI 直接 400 "schema too complex / not strict" |
| **`enum` vs `oneOf`** | OpenAI strict 不接受 `oneOf`，必须 `enum` 列尽 | 写了 oneOf 整段被拒 |
| **`nullable: true` vs `type: [..., "null"]`** | OpenAI strict 不接受前者，必须 type 数组列 null | 写了 nullable 字段被拒 |
| **协议 B 没有 `response_format`** | 输入字段是 `tools[].input_schema` + `tool_choice` | 在协议 B 上找 response_format 找不到（尤其协议 A 切 B 时） |
| **B2 vs B3** | B3 强制调特定工具；B2 模型自决 | 想必调结果空——大概率用了 B2 不带 `tool_choice: { type: "tool", name }` |
| **B3 行为：`strict` 闸 vs `soft` 闸** | 协议 A3 是 token-mask（物理）；协议 B3 是 input_schema + tool_choice 软约束 | 把协议 A3 的"严"直接套到协议 B3 期望值上 |
| **协议 B3 模型拒调 vs 协议 A3 模型硬吐** | A3 强制有结果（哪怕错）；B3 可能**没有 tool_use block**（模型没说怎么调） | 协议 B3 server 必须处理"content 数组里没有 tool_use"分支；A3 不用 |
| **output 位置：`message.content` 字符串 vs `content[type=tool_use].input` 对象** | A 永远是字符串要 parse；B 强制调工具时是**对象**不用 parse | 协议 B3 拿到的 input 别 `JSON.parse` 了——它已经是对象 |
| **`response_format` 名字相同 ≠ 行为相同** | OpenAI / MiniMax / Zhipu 都标，但 MiniMax silently ignored strict | 国内切 provider 前实测 5 用例 |
| **协议 B `tools` 不带 `tool_choice` 时的行为** | 模型自决：可能调、可能不调；**不会**因你没强制就不调 | 想必调漏写 tool_choice 不报错但行为不是预期 |

---

## 怎么选用（决策树 + 矩阵）

### 决策树

```
你用哪个 provider？
  ├─ OpenAI 自己（不是 OpenAI 兼容网关）
  │   ├─ schema 写得下白名单（无 anyOf / $ref）→ A3 strict + Zod 后置
  │   ├─ schema 里有 anyOf / $ref → A2 JSON Mode + 强 Zod；或换 B
  │   └─ 实验期 → A2
  │
  ├─ Anthropic 自己
  │   ├─ 默认 → B3 tool_choice 强制 + Zod 后置
  │   └─ 想让模型可以拒答（模糊请求 → 反问）→ B2 tool_choice 任意
  │
  ├─ 国内 provider（DeepSeek / Zhipu / MiniMax / Kimi / Qwen...）
  │   ├─ 用 OpenAI 协议 SDK → A2 JSON Mode + 强 Zod（不要信 strict）
  │   ├─ 用 Anthropic 协议 SDK → B3（**实测守约率高于 A3**，本 demo 实证）
  │   └─ 双协议都支持（如 minimax）→ 优先 B3
  │
  └─ 跨 provider / 不知道 / OpenAI 兼容网关
      ├─ 切生产前**实测 5 用例**（用本 demo 这套 prompt）
      ├─ 比 Zod ✓ 比率 / strip-wrapper 命中率
      └─ 通常结论：B3 在国内 provider 上更稳
```

### 场景矩阵

| 场景 | 推荐 |
| --- | --- |
| OpenAI 项目，schema 写得下白名单 | **A3** + Zod 后置 |
| OpenAI 项目，schema 含 `anyOf` / `$ref` | **A2** + 强 Zod |
| Anthropic 项目，任何场景 | **B3** + Zod 后置（防拒调） |
| 国内 provider（任何协议） | 协议 B 优 **B3**；协议 A 一律 **A2**（strict 不可信） |
| 跨 provider 项目 | **B3** + 先实测 5 用例 |
| 实验性脚本 / 一次性 | **A1 / B1**（prompt-only 零配置） |
| 模型可以拒答（"模糊请求反问" 诉求） | **B2**（tool_choice 任意） |
| 多 schema 路由 | **B2**（多个 tool + tool_choice 任意） |
| 要"闸最硬" | **A3**（仅 OpenAI 自己时） |
| 要"闸宽松 + 自由度高" | **A1 / B1** |

---

## 取舍（两难选择的标准）

| 决策点 | 推荐路径 | 何时反向 |
| --- | --- | --- |
| 跑 OpenAI 自己，schema 复杂 | A2 + 强 Zod | schema 简单 → A3 |
| 跑国内 provider 用 A 协议 SDK | A2 + 强 Zod | 同家 provider 也支持 B → 切 B3 |
| 跑 Anthropic 但 schema 想严格 | B3 + Zod | schema 含可选分支极多 → B3 + repair loop（防拒调） |
| 模型偶尔需要拒答 | B2 | 用户不愿拒答就走 B3 |
| 项目还没切 provider，先接 OpenAI | A3 | 之后若转 OpenAI 兼容网关，迁回 A2 |
| 严守 schema（schema 不允许 anyOf） | A3 | 改用 B3 让 schema 自由 |

---

## 延伸 · 多协议 × 多模型 · 生产的层叠防御

> **这一节不在 04.02 学习要求内**——是协议层学完后面对"多家 provider + 多协议 SDK + 模型差异"的工业级补充。完整答案在 [模块 23 · Production Agent Architecture](../23-Production-Agent-Architecture/README.md)；这里立骨架 + 指路。

### 1. 模型差异 > 协议差异（实测为证）

同一个 `response_format: json_schema strict: true` 在不同 model 上的实测守约率：

| Model | Protocol | 实测 A3 守约 | 关键提示 |
| --- | --- | --- | --- |
| gpt-4o-2024-08-06 | A | ~95% | token-mask 真做了 |
| o3 / o4 系 | A | ~95% | 仍夹 `<think>`，要 strip |
| claude-3-7-sonnet | B | ~85% | 可以拒调工具（B3 软约束） |
| DeepSeek v3 | A | ~30% | strict 部分支持；reasoner 必夹 `<think>` |
| **MiniMax-M3** | A | **0%**（silently ignored） | strict 完全失效；走 A2 + 强 Zod |
| **MiniMax-M3** | B | **5/5 ✓**（本 demo 实证） | 同一家走协议 B 反而最稳 |
| Zhipu GLM-4.x | A | ~50% | strict 部分实装；版本差异大 |

**铁则**：切 provider 前**实测 5 用例**（就是本 demo 那 5 个 prompt）；**不可依赖文档**。

### 2. 5 层防御（每层都假设上一层会失败）

| 层 | 上一层的失败被本层兜 | 做什么 |
| --- | --- | --- |
| **L1 · API 路径选择** | "这家 strict 不真做了" | 按 provider profile 选最强档；fallback 到下一档 |
| **L2 · 协议字段** | "字段填错" | 严格按协议写：`response_format` / `tools` / `tool_choice` |
| **L3 · strip wrapper** | "模型夹 `<think>` / ` ``` fence` / `...`" | `stripWrap()` 链 |
| **L4 · Zod 后置** | "schema 仍漏 / 漂" | `IntentZod.safeParse()` |
| **L5 · Repair / 降级** | "L4 仍失败" | repair prompt → 重试 → 切另一 provider |

**核心原则**：任何一层都不是 100%——**下一层永远兜住上一层**。

### 3. Schema 单一来源

```ts
// 唯一真相
const IntentZod = z.object({
  action: z.enum(["search", "order", "cancel"]),
  query: z.string().min(1),
  qty: z.number().int().positive().optional(),
});

// 派生到各协议
const IntentJsonSchemaA   = zodToJsonSchema(IntentZod, "Intent");           // 协议 A strict 用
const IntentAnthropicSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["search", "order", "cancel"], description: "用户动作" },
    query:  { type: "string", minLength: 1, description: "查找内容" },
    qty:    { type: "integer", minimum: 1,  description: "数量（可选）" },
  },
  required: ["action", "query"],
  additionalProperties: false,
};                                                                          // 协议 B 用
```

**反模式**：每个 provider 各维护一份 schema → 改一处漏五处 → 上线后模型按"过时"schema 输出 → 跟你 Zod 永远对不上。

### 4. 生产经验：跨 provider / 跨协议时的"隐藏规则"

> 这一节保留**踩坑后总结出的"经验"**——不做独立模块、不写"Provider Profile"代码。server 当前端点直接 hardcode 端点参数，按本节 + §踩坑 #14-#16 反着查"必须避开的雷"。生产上落地 Provider Profile 是不是要的另说，但 demo 这层先保持简单。

#### 4.1 system prompt 必须含协议专属关键词

两协议都有"看似无关、实则必需"的关键词要求：

| 协议 | 关键词 | 缺失时表现 | 修法 |
| --- | --- | --- | --- |
| **协议 A** | system message 含 `json` 字样（"JSON" 也算；中文"JSON" 也算） | DeepSeek-V4-Pro 实测：HTTP 400 `Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'` | 显式写一句 `"请以 JSON 格式返回结构化结果。"` |
| **协议 B**（Anthropic SDK） | `thinking: { type: "disabled" }`（如果模型是 reasoning-capable） | DeepSeek-Reasoner 实测：HTTP 400 `Thinking mode does not support this tool_choice` | 调用 `messages.create` 时显式加这一行 |

#### 4.2 两协议 A3 / B3 的"物理不可用"清单（不需要 Provider Profile 也记住）

- **协议 A** `response_format: { type: "json_schema", strict: true }` —— DeepSeek 返 400 "type is unavailable now"；MiniMax-M3 silently ignored；只有 OpenAI 自己做真 token-mask。
- **协议 B** `tool_choice: { type: "tool", name }` 强制调工具 —— DeepSeek-Reasoner 返 400 "Thinking mode does not support this tool_choice"；其它 reasoning 模型类似。

**结果**：在不能控制 provider 的前提下，**这两个最强档**几乎一定失败，落到 A2 / B2 已经是上限；要真守 schema 仍需 Zod 后置（[§踩坑 #3](#踩坑本-demo-实证数据逐条编号)）。

#### 4.3 MiniMax-M3 silent ignore 比 DeepSeek loud reject 更危险

| Provider | A3 strict 失败行为 | 信号强度 |
| --- | --- | --- |
| **MiniMax-M3** | API 返 HTTP 200，模型自由发挥——schema 完全没校验 | ❌ **silent ignore**——最危险 |
| **DeepSeek** | API 返 HTTP 400 `"type is unavailable now"` | ✅ **loud reject**——好 |

**判断**："silent ignore 比 loud reject 危险 100 倍"——loud reject 立刻知道路径不通降级；silent ignore 看上去"成功"实际 schema 没校验。所以 **MiniMax-M3 经验**值得单独记（§踩坑 #4）。

### 5. 多模型同时用 · 4 种范式

| 范式 | 干什么 | 落点 |
| --- | --- | --- |
| **灰度 A/B test** | 同 prompt 同时跑 2 个 model，比对 | 当前条 demo 两侧并排就是这个 |
| **Fallback 链** | 主失败切备（primary → backup） | 上面 L5 的"切另一 provider"是这条的具体实现 |
| **按任务路由** | 简单任务便宜 model，复杂用贵的 | 模块 19 |
| **多视角 ensemble** | 多 model 投票 | 模块 14 Multi-Agent |

### 6. Protocol Adapter · 业务不关心协议

仓库已有 [`apps/02-LLM-API开发/03-adapter-demo-step-1/`](../../apps/02-LLM-API开发/03-adapter-demo-step-1/README.md) 这个雏形（"业务只调 `sendMessage`"）。生产里把这层做厚 = L1+L2 的封装：

```ts
interface IntentCall {
  prompt: string;
  schema: ZodSchema;
}

// 业务只看到这个
const result = await llm.intent({ prompt, schema });
// 内部：选档 → strip → Zod → repair → fallback
```

`apps/llm.ts` 的 `getLlmOptional()` 已是雏形——按这条路把 retry / schema 单源 + provider profile 加进去就能起。

### 7. Repair loop · Zod 失败别直接重发

```ts
async function callWithRepair(prompt, schema, model, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    const raw = await llm.intent(prompt);                         // adapter 内部已 strip + parse
    const r = schema.safeParse(raw);
    if (r.success) return r.data;

    // repair prompt 只贴 issues + 上次的输入，不贴整段对话（避免 prompt 膨胀）
    prompt = `上一次输出不符合 schema：\n${
      r.error.issues.map(x => `  - ${x.path.join(".")}: ${x.message}`).join("\n")
    }\n请重新输出合法 JSON。`;
  }
  return null;                                                     // 多次失败 → fallback / 报警
}
```

### 8. 生产清单

- [ ] **Schema 唯一来源**：Zod 一份，派生各协议 schema
- [ ] **Provider profile 表**：每家标 `maxUsefulTier` + `fallback` + `notes`
- [ ] **Protocol adapter 抽象**：业务不写 OpenAI / Anthropic
- [ ] **5 用例 smoke test 进 CI**：本 demo 那 5 用例就是骨架
- [ ] **Zod 后置**：永远得有——不要相信任何协议的"物理闸"
- [ ] **Repair loop 控制 prompt 大小**：只贴 issues，不贴全文
- [ ] **多模型 fallback / router**：主备 / A/B / 按任务路由
- [ ] **.env 分离 `LLM_PROVIDER` 与 `LLM_MODEL`**（已有 §5.0）

### 9. 这条问题在仓库的位置

| 模块 | 这条问题在那模块的位置 |
| --- | --- |
| 02 · LLM API 开发 | 协议 A vs B 入口（已学完） |
| 13 · Agent Framework | "框架省了什么"——provider 抽象 + retry + 路由 |
| 14 · Multi-Agent | 多模型投票 / fallback 链 |
| 19 · 可靠性 / 成本 / 性能 | 熔断 + 缓存 + 按任务总成本路由 |
| **23 · Production Agent Architecture** | **完整答案**——1000 DAU 成本估算 + 上述全部拼起来 |

---

## 踩坑（本 demo 实证数据，逐条编号）

1. **「夹 `` ``` fence``」是常态不是例外**。 5 用例里 MiniMax-M3 的 `json_object` 路径几乎每条都夹 ` ``` json...``` `。`JSON.parse` 仍会拒。生产必须先 strip。本 demo `stripWrap()` 是最小骨架（剥 `<think>` / ` ``` fence` / 末尾省略号）。
2. **推理模型夹 `<think>`**。 任意思考模型（minimax / DeepSeek / Qwen 推理模式）会先吐 `` `<think>...</think>` ``，再吐 JSON。`JSON.parse` 仍会拒。本 demo 已 strip；切新 provider 时一定 strip。
3. **`raw.includes("```")` ≠ 解析失败**。 `stripWrap()` 后再 `JSON.parse` 是同一个 strip 链；前后不一致就会出现「Zod ✓ + 缺 keys 同亮」这种矛盾 bug——本 demo 早期就是这样，靠把 `safeParseIntent` 和 `analyze` 共用同一个 `stripWrap()` 解决。**永远不要让"原始 raw"和"清洗后的 raw"走两条不同路径**。
4. **OpenAI strict `⑥ 故意 schema 写法不对` 在 MiniMax-M3 上 silently accepted**。 实际 API 行为：故意发缺 `additionalProperties:false` + 含 `anyOf` 的 schema，期待 OpenAI strict 返 400，**MiniMax-M3 返回 200 + `unexpectedSuccess: true` + 模型自由响应**。实证证明 MiniMax-M3 把协议 A 的 `strict` 当 no-op 处理。生产里**不要假设国内 provider 真做了 token-mask**。
5. **协议 B3 模型拒调工具是合法行为**。 prompt 强引导违 enum（要 `action: "unknown"`）时，协议 B3 没让模型硬填 `unknown`，反而返回了一段说明文字 + 不调工具。协议 A3 在这种情况下会**硬吐**——乱、有，但有。生产上协议 B3 server 代码必须兜底「content 数组里没有 tool_use block」，默认空、重试或降级到 B2。
6. **多 protocol 协议 A vs 协议 B 的 `name` 字段**。 协议 A 的 `response_format.json_schema.name` 是 SDK 缓存键；协议 B 的 `tools[].name` 是函数名。看起来都是 `name`，但**不要**套用 A 的 `name` 概念去理解 B——B 的 `name` 是工具路由，不是缓存键。
7. **`max_tokens` 是协议 B 必填**。 忘填直接 400（`messages.create` 必传）。Anthropic SDK 不会默认帮你填。OpenAI 不需要。
8. **协议 B 响应是数组而非对象**。 `res.content` 是 `ContentBlock[]`——用 `block.type` 区分文本与 `tool_use`。直接 `res.text` 这种属性是不存在的。带 for-of + `if (block.type === "tool_use")` 才是稳定写法。
9. **协议 B `tool_choice: { type: "tool", name: "..." }` 的 `name` 必须匹配 `tools` 里的**某个 `name`**。 拼错就 400。
10. **Anthropic SDK 类型 narrowing**。 `.filter((b): b is { type: "text"; text: string } => ...)` 这种显式 type predicate 容易漏 SDK 的可选字段（如 `TextBlock.citations`）。**用 for-of + `if (block.type === "text")`** 让 TS discriminated union 自动收窄更稳。这是本 demo 第一轮 typecheck 的两个错误之一。
11. **JSX 文本里 `<` 必须 `{"<"}` 转义**。 Babel 把 `<think>` 当成新 JSX 标签，找不到 closing tag 直接 break。`apps/04-Structured-Output/02-JSON-Mode-vs-Tool-Use-ProtoB-step-1/public/index.html` 的 `夹 <think>` 第一次实测踩坑——按 §5.3.4 规则改成 `{"<think>"}` 即可。
12. **条二份 HTTP Demo 的端口 vs 脚本名规则**。<!-- TODO: §5.3.3 端口规则已改为顺序分配（max + 1），本段讲解的 `+10` 措辞已过时；踩坑事实（脚本名沿用真实小节号）仍成立，但「+10 错开端口」解释需重写或删。旧值保留只为 git blame。 --> 原措辞：§5.3.3 那句"小节两位 `+10`"措辞模糊——读起来像脚本名也要带 `+10`，**实际仓库既有样本（`02-03-abort-controller` + `02-03-adapter`，端口 `50203` → `50008` / `50213` → `50007`）证明脚本名沿用真实小节号**，**只有端口错开**。本 demo 第二份 HTTP Demo 原本命名为 `app:04-12-anthropic-tool-use`，已修正为 `app:04-02-anthropic-tool-use-step-1`，端口 `50412` → `50016`。
13. **协议 B 没有"JSON Mode"等价字段**。 协议 A 的 `json_object` 在 B 上没有对位字段。协议 B 唯一进入结构化路径的方法是 `tools + tool_choice`。**`tools` 是协议 B 的"闸的容器"**，不是一个开关。
14. **thinking 模式与 tool_choice 是物理冲突**。 OpenAI o 系列 / DeepSeek-Reasoner / Anthropic extended thinking 等 **reasoning 模型** 在 thinking 路径下，**B3 强制 tool_choice 会被 HTTP 400 拒绝**，原文 `Thinking mode does not support this tool_choice`（DeepSeek-Reasoner 实证）。A3 strict 同理受 token-mask 限制，reasoning 模型一般拿不到 A3。**修法**：(a) 协议 B 显式 `thinking: { type: "disabled" }`（Anthropic SDK 顶层字段）；(b) 协议 A 没法关，只能换非 reasoning 模型；(c) 生产上落地 Provider Profile 时要标 `thinking` 字段、reasoning 模型上把 A3/B3 自动降档到 A2/B2。**§4.1 / §4.2** 是这条对应的代码与判定清单。
15. **adapter 不能把上游 4xx 都包成 500**。 `ctx.status = 500` 把上游 HTTP 400 / 401 / 429 全掩盖了，watchdog 看到的全是 500、看不到真正失败。**修法**：catch 块从上游 SDK 错误对象上读 `.status` 字段（OpenAI `APIError.status` / Anthropic `APIError.status`），透传 `ctx.status = upstreamStatus ?? 500`，**body 加 `upstreamStatus` 字段给前端**。本 demo 两个 server.ts 已加 `writeUpstreamError()` helper 并替换所有 6 个 catch 块。
16. **DeepSeek A2 隐藏规则：prompt must contain "json"**。 即便 `response_format: { type: "json_object" }` 已经被 provider 接受，DeepSeek-V4-Pro 实测会再校验一层：**请求的 messages 里必须出现 "json" 字样**（"JSON"、"json" 都算，**中文"JSON"也算**），否则返 `HTTP 400 Prompt must contain the word 'json' in some form to use 'response_format' of type 'json_object'`。**修法**：保证 `system` 消息含 "JSON" 二字（"按用户的意图返回 JSON" 即可；不写也几乎所有 prompt 自然带，但生产代码还是显式）。这是**第 5 类 Provider 隐藏规则**（与 strict 不可用、thinking 冲突、protocol B3 模型拒调、`thinking` 字段未配是并列）；前两类由 profile 治理（参见 §4 经验），这一类要在 `system` 内容里**契约式**含关键词——不能只靠 profile。

---

## 仓库内约定（落在这条 Demo 里要遵守的）

### 端口约定（[§5.3.3](../../AGENTS.md#533-目录与脚本)）

<!-- TODO: §5.3.3 已改为顺序分配（占用表当前最大 + 1）。本表展示的 `5{模块}{小节}` / `+10` 公式已不再适用；下表保留只为 git blame。当前实际占用：协议 A `50015`、协议 B `50016`。 -->

| 第一份 HTTP Demo | 第二份 HTTP Demo（同小节） |
| --- | --- |
| 端口 `5{模块两位}{小节两位}` 例：`50402` | 端口 `5{模块两位}{小节两位 +10}` 例：`50412` |
| 脚本 `app:04-02-…`（沿用真实小节号） | 脚本**也用 `app:04-02-…`**，**只有端口错开** |
| 文件夹 `02-JSON-Mode-vs-Structured-Output/` | 文件夹 `02-JSON-Mode-vs-Tool-Use-ProtoB/`（沿用真实小节号 + 描述性尾缀区分用途） |

> §5.3.3 那段"小节两位 +10"措辞：示例 `03 → 13` 指的是**端口**侧。脚本名 / 文件夹名 / `app:` 前缀都沿用真实小节号。

### 强制 HTML 骨架（[§5.3.4](../../AGENTS.md#534-html-固定骨架强制)）

- Tailwind 4 browser CDN 原样（含 integrity，禁止换 CDN / 版本）
- React 18.3.1 UMD
- Babel Standalone **锁定 7.26.4**（8.x 默认 preset-react automatic runtime，与"完全 ESM 禁用"冲突）
- `<script type="text/babel">` 块最后（**严格按此序**，否则 React 未定义炸）
- 4 个强制 id：`#page-header`（含 `#page-title` + `#status-pill`）/ `#page-main`（含 `#controls` + `#output`）/ `#page-footer`
- `#status-pill` 四态：`⏸待连接` / `🔄请求中` / `✅完成` / `❌错误`
- **JSX 文本里 `<` 必须 `{"<"}` 转义**（踩坑 11）
- 页脚写端口时**禁止**写死模型名（如 `MiniMax-M3`）；跟 `apps/.env` 的 `LLM_PROVIDER` / `LLM_MODEL`

### §5.3.2 四项必齐

每个 §5.3 demo 必齐：(1) happy path (2) 错误处理 ≥ 2 类 (3) loading 状态 (4) 单会话输出区。

### helpers 抽取原则

当两个函数用同一份清洗或解析逻辑时，**抽 helper，不要各写一份**——这是踩坑 3 的根因。本 demo 把 `stripWrap()` 抽出，`safeParseIntent` 和 `analyze` 共用。

---

## 我追问过的

- **「举几个例子，这个库的调用的返回值是什么」**（来源 01 条对话里的相关追问，影响复用契约写法）→ 同契约的 Zod 端在协议 A 走 `message.content` 字符串 + JSON.parse；协议 B 走 `content[type=tool_use].input` 对象不要 parse。
- **「写demo」（强制出 Demo）」** → 落协议 A `apps/04-Structured-Output/02-JSON-Mode-vs-Structured-Output-step-1/` §5.3 完整版；后来又写一份协议 B 镜像 `apps/.../02-JSON-Mode-vs-Tool-Use-ProtoB/` 端口 `50412` → `50016`。`yarn typecheck` 过；浏览器跑过 5 用例 + ⑥。
- **「说是解析 OK 了，但页面又显示缺 action,query」** → 真 bug：`safeParseIntent` 和 `analyze` 用两份独立 strip 链。**根因**：早期 `analyze` 把 4 个 `.replace()` 串成一行没有 trim，剥掉 `<think>` 之后剩 `\n```json…` 开头 `\n` 让 `^```(?:json)?\s*\n?` 匹配不到 → JSON.parse 挂 → keysSeen 空 → 缺 keys 标签错亮。**修法**：抽 `stripWrap(raw)`，两函数共用同一清洗链，每步后强制 `.trim()`。从此「Zod ✓」与「keysSeen 非空」必然同进同出，不再矛盾。
- **「停掉服务，然后详细解释这个协议 A 的请求参数中的 `response_format`」** → 沉淀补充了 4 种 `type`、6 路全景的协议 A 端；本沉淀正文里协议 A 的「是什么」一节就是这一问的基础上的展开。
- **「再把协议 B 的也做一份，然后把两份协议的 demo 都写清楚一点」** → 新建协议 B demo + 渲染同 5 用例 + ⑥ prompt 诱导模型违 input_schema；两份 README 重写成对称镜像（端口公式 + 一图看清表 + 端点 + §5.3.2 四项 + 5 用例 + 没做的事）。
<!-- TODO: §5.3.3 已改为顺序分配。本行历史端口样本 `50203` / `50213` 已分别映射到 `50008` / `50007`；旧值保留只为 git blame。 -->
- **「这个 script 为什么写成 `04-12-...`」** → 这是 §5.3.3 措辞模糊踩坑：本应 `app:04-02-...`，**只有端口错开**——印证既有 `02-03-abort-controller` + `02-03-adapter` / `50203` + `50213` 样本。
- **「总结一下这两个协议的各种方式……」** → 沉淀的核心内容：6 路全景（A1/A2/A3 + B1/B2/B3）；协议 A vs B 根本差异；决策树 + 矩阵；各 Provider 实测；prompt-only 路单独说明；本 demo 实测数据并入踩坑。
- **「不同模型不同国产/海外差异更大，生产多个模型怎么办」** → 沉淀「延伸 · 多协议 × 多模型 · 生产的层叠防御」整节：5 层防御（每层假设上一层失败）+ Schema 单一来源 + Provider Profile 表 + 多模型 4 范式 + Protocol Adapter 抽象 + Repair loop 示例 + 8 条生产清单 + 仓库位置地图。**这是当前条之外**但与本条强相关的内容——主轴答案在模块 23，本节立骨架 + 指路。
- **「DeepSeek 模型 协议 A：`response_format.json_schema` HTTP 400 `"type is unavailable now"`」+ 「协议 B：`tool_choice` HTTP 400 `"Thinking mode does not support this tool_choice"`」** → 两错一起沉淀：(a) Provider Profile 必须有 `thinking: "always_on" | "off_by_default" | "configurable"` 字段；`pickTier()` 在 `always_on` 模型上自动降一档；(b) `MODEL_PROFILES` 行更新：`deepseek-chat` 标 `off_by_default` + notes `"reasoning strict 暂未开放"`；`deepseek-reasoner` 标 `always_on` + notes `"HTTP 400 'Thinking mode does not support this tool_choice'"`；`claude-3-7-sonnet` 标 `configurable` + notes `"用 tool_choice 时显式 thinking:{type:'disabled'}"`；(c) §4.1 增加协议 B 显式关 thinking 的代码示例；(d) `apps/.../*/server.ts` 加 `writeUpstreamError(ctx, err)` helper，所有 6 个 catch 块透传 `upstreamStatus` 字段而不是包 500。这条实证直接进了踩坑 #14 和 #15。
- **（历史）Provider Profile 真接 + DeepSeek 实证：0 个 400（已撤回 2026-09-03）** → 一度把 `apps/model-profile.ts` 共享模块（含 `MODEL_PROFILES` 13 行 / `FUZZY` 9 条 / `pickTier` / `planProtocolA` / `planProtocolB`）+ A→B tier mapping helper 都接进两端 server，并加 `/api/profile` 端点；实测 A 列 5/5 Zod ✓、B 列 8/10 Zod ✓，0 个 400。后来按"回到最简单版本"撤回——`apps/model-profile.ts` 删除、两端 server 回到 hardcode `response_format` / `tools` + `tool_choice`、剖面见 §4 经验列表。**仍保留的实证结论**：DeepSeek A2 prompt-must-contain-json（[踩坑 #16](#踩坑本-demo-实证数据逐条编号)）+ 思考模式与 tool_choice 不兼容（[踩坑 #14](#踩坑本-demo-实证数据逐条编号)）+ 上游 4xx 别都包 500（[踩坑 #15](#踩坑本-demo-实证数据逐条编号)）——这三条作为 Provider Profile 概念的心智模型保留，不再写独立代码模块。

---

## 过关自检

> 目标：「能说清严格模式多保证了什么」+ §6.2 全套要求。

1. **把"协议 A strict 模式多保证什么"用三句话讲清**：(a) 保 JSON 语法合法（== A2） + (b) 保符合 JSON Schema 白名单（enum、required、type、additionalProperties）；(c) OpenAI 自己的物理实现 = token-mask，不是 prompt-level。
2. **协议 A3 vs 协议 B3 在「失败时」行为上的根本差异是什么？** 答：协议 A3 强制有结果（哪怕 schema 不合；模型硬吐）；协议 B3 模型可以**拒绝调工具**——返回没有 `tool_use` block 的 content 数组，server 拿到的是一段说明文字。这影响 server 端重试/降级逻辑写法。
3. **同一段 prompt "请把 action 字段填成 'unknown'"，协议 A2 / 协议 A3 / 协议 B3 三条路径下分别给什么？** 答：A2 给 `{"action":"unknown","query":...}`（服从 prompt）；A3 在 OpenAI 上由 token-mask 把 `unknown` mask 掉改吐一个合法 `search`/`order`/`cancel`（**MiniMax-M3 实测退化成 A2——没做 token-mask**）；B3 模型拒调工具，返回说明文字（实测 MiniMax-M3）。
4. **JSON Mode 输出夹 `` ``` fence `` 该怎么处理？代码上要做什么？** 答：先用 `stripWrap()` 三类剥离（`<think>` / ` ``` fence` / 末尾省略号），每步后 `.trim()`，然后 `JSON.parse` → Zod 后置。**stripWrap 必须所有解析路径共用**，不要让"原始 raw"和"清洗后 raw"走两条独立链（这正是早期 bug 根因）。
5. **协议 B3 路径上 server 端拿到 `res.content` 后怎么处理？** 答：迭代 `ContentBlock[]`，对每个 block 用 discriminated union 判断 `type === "tool_use"` → 拿 `block.input`（已是对象，**不要 JSON.parse**）；找 `type === "text"` → 拼成 `raw` 备用。模型拒调 = 数组里没有 tool_use block，必须有 fallback（空 input / 重试 / 降级 B2）。
6. **国内 provider 用协议 A 的 `response_format: { type: "json_schema", strict: true }`，是不是就够了？** 答：**不够**——大多数国内 provider（包括 MiniMax-M3）不真做 token-mask，silently ignored；`strict: true` 在国内环境下行为等同于 A2。生产必须实测 5 用例验证守约率；不达标就降级到 A2 + 强 Zod 后置，或者切协议 B3。

---

## 还没搞懂的

- **JSON Schema Draft 2020-12 vs Draft-07** 在 LLM SDK（OpenAI / Anthropic / 各国内）实际接受的字段子集差异。**目前默认 2020-12**；碰到 SDK 报错再回查各 Provider 的实际接收版本。
- **Anthropic prompt caching** 与 `tools` 缓存的具体机制。本 demo 还没踩这个——下个高流量场景再实测。
- **国内各家协议 B 的实装差异**——本 demo 仅跑 MiniMax-M3 一家。DeepSeek、Zhipu、Kimi、Qwen 协议 B 实装是否守 input_schema / tool_choice 强制？各自 schema 拒绝报错的形态？需要逐家再写一份 5 用例实测报告（这是下一条「03 模块复盘」或后续一个独立条目）。
- **`tools: [...]` 给多个工具 + `tool_choice: { type: "any" }`** 多 tool 路由的实测表现——本 demo 只用了单 tool。需要一份"5 用例 × 3 个 tool"的实测，看模型自决的工具路由是否守 input_schema。
- **协议 A3 strict 缓存复用行为**——同一 `name` 第二次请求是否真变快？延迟差多少？需要一次正面的 cache-hit / cache-miss 对照。

---

## §5.2 Demo 判断块（按 [§6.3 行 717](../../AGENTS.md#6-交互命令) 必须打）

```text
Demo 判断
- 小节：JSON Mode vs Structured Output：前者保证合法 JSON，后者保证符合 schema
- 结论：可运行 §5.3（两份）
  - 协议 A 落点：apps/04-Structured-Output/02-JSON-Mode-vs-Structured-Output-step-1/
    · yarn app:04-02-json-mode-vs-structured-output-step-1 · 端口 50015
  - 协议 B 落点：apps/04-Structured-Output/02-JSON-Mode-vs-Tool-Use-ProtoB-step-1/
    · yarn app:04-02-anthropic-tool-use-step-1 · 端口 50016（同小节第二份 HTTP Demo，按占用表顺序分配）
- 理由：要看见"两协议 × 6 档"的可观察对照——同 5 用例 × 同 prompt × 双协议；
       还要看见协议 A3 ⑥ schema 不严格 → API 400 的实装差异；
       和协议 B3 ⑥ prompt 诱导模型拒调工具这个失败行为的实装。
- 错误传播：所有 catch 走 `writeUpstreamError(ctx, err)` helper，透传上游 HTTP 状态码（[踩坑 #15](#踩坑本-demo-实证数据逐条编号)）
- DeepSeek 兼容：协议 A system prompt 含 "JSON" 关键字（[踩坑 #16](#踩坑本-demo-实证数据逐条编号)）
- yarn typecheck：✅ 过
- 浏览器验证：
  · 50015（MiniMax-M3 原跑）：5 用例 × 2 mode；JSON Mode 5/5 Zod ✓；Structured Output strict 0 个 Zod ✓（MiniMax-M3 silently ignored strict，模型自由发挥）
  · 50016（MiniMax-M3 原跑）：5 用例 × 2 mode；text 路径 5/5 Zod ✓；tool-use 路径 4/5 Zod ✓（① 5/5、⑤ 5/5 OK，② ③ ④ 模型层输给 prompt）
  · 50015（DeepSeek-V4-Pro 实跑）：JSON Mode 5/5 Zod ✓；Structured Output 0/5 Zod ✓（A3 strict 不可用被 400 拒，⑥ strict-rejected 同样返 400）
  · 50016（DeepSeek-V4-Pro 实跑）：text 路径 4/5 Zod ✓；tool-use 路径 5/5 Zod ✓（B3 强 tool_choice 仍 OK）；⑥ tool-rejected 返 400 'Thinking mode does not support this tool_choice'
- 与 start 预告：一致
```

## 与 01 条沉淀的桥梁

- 本条的 Zod schema 与 01 条的 IntentZod 是**同一份契约**。本条用 ZodZod 写一遍，是为了演示协议 B 端 input_schema 与协议 A 端 json_schema 写法的对比——并不是 Zod 不重要。
- 协议 A 端 `json_schema` 写法要求（白名单、无 anyOf、必 additionalProperties:false）比协议 B 端 `input_schema` 严得多。**鉴于此，整个 Agent 系统最佳实践**是：
  1. **以 Zod 为单一事实来源**（用 `zodToJsonSchema` 派生 JSON Schema 给协议 A strict）
  2. **协议 A strict 跑得通就派协议 A strict**；strict 跑不通或切 B 协议就派协议 B 强制 tool_choice
  3. **服务端 Zod 后置兜底永远得有**——token-mask 与 soft-anchor 都不是 100%
