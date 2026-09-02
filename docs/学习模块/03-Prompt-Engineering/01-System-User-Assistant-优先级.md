# **System / User / Assistant 优先级**：冲突时谁说了算、System 该放什么

> 对应模块：[模块 03 · Prompt Engineering ⭐⭐⭐⭐](./README.md) · 小节进度第 1 条
> Demo：已落 [apps/03-Prompt-Engineering/01-System-User-Assistant-优先级/](../../../../apps/03-Prompt-Engineering/01-System-User-Assistant-优先级/) · `yarn app:03-01-system-user-assistant-priority`（HTTP server · 浏览器端口 50301 · 3 个 Case × 协议 A/B）

- **来源**：本对话全部轮次（详解 + 三个意外发现 + Case 1 判错修正 + 协议 A 关思考的工程答案）+ 跑通的 Demo 实测
- **状态**：已沉淀

> 各节写什么、怎么判断归哪一节、达标要求：见仓库根 [AGENTS.md §7.2](../../../AGENTS.md#72-沉淀--小节进度对齐)。
> 学习者只减不加。

---

## 是什么

LLM 的 prompt 不是"一段话"，而是**几条结构化的消息**（messages），按角色分。OpenAI 协议 A / Anthropic 协议 B 都是这个模型，字段名略有差异，但角色语义一致：

| 角色 | 谁的 | 干什么 | 一个最小例子 |
|------|------|--------|--------------|
| `system` | 应用方 / 部署者 | **全局指令**：身份、语气、边界、风格、输出约束 | "你是一名中文助手，回答不超 100 字" |
| `user` | 真实用户 | 当前一轮的实际输入；问题、上下文、附带数据 | "帮我把这段话改得更口语" |
| `assistant` | 模型自己 | **历史回复**：多轮对话里把之前模型的回答原样塞回去 | 模型上一轮的 "好的，改写如下…" |

调用时实际长这样（OpenAI 协议 A）：

```ts
messages: [
  { role: "system",    content: "你只能输出 JSON" },
  { role: "user",      content: "把这句评价分类：pos / neg" },
  { role: "assistant", content: "{\"label\":\"neg\"}" },   // 多轮时塞回去
  { role: "user",      content: "那这句呢：「一般般」" }
]
```

**优先级是训练时的事实**（System > User > Assistant），不是厂商开关。这来自 RLHF 安全护栏：模型被训练成"先遵守 System，再听 User，不被自己的历史绑架"。但模型不是机器人严格执行 if-else —— 碰到强诱导（"忽略上面所有指令…"）仍可能偏；所以关键约束要做**双层**（System + Gateway 校验）。

---

## 为什么（Agent 开发要懂）

1. **System 是"车的说明书"，User 是"乘客指令"**：乘客说"忽略说明书随便开"——LLM 训练时**优先级**就是 System > User > Assistant；User 想覆盖 System 必须明确指令等级，否则模型仍按 System 走。
2. **System 写错地方 = 整个 Agent 翻车**：把"必须用 JSON 输出"放在 User 里，用户下一句问"用一句话回答我"时，模型就**真的**用一句话回答你——JSON 约束瞬间失效。**约束类 / 安全类 / 风格类** → 必须放 System。
3. **Assistant 角色不是"AI 的自言自语"**：多轮对话里**必须**把之前模型的原文原样塞回去当 assistant message；只塞用户消息 = 让模型"失忆"，上下文断了，幻觉起飞（见下方 Case 3 协议 B 的"编天气"幻觉样本）。
4. **System 不是越长越好**：太长 → 注意力稀释（"lost in the middle"）→ 模型对中后段的 System 指令越来越不敏感。System 该放的是**约束 / 边界 / 风格 / 输出格式**，不是"业务规则全部"。

---

## 易混点

| 误读 | 真相 |
|------|------|
| System prompt = "系统消息" = 平台公告 | 完全不是。"系统消息"在工程上指 `role: "system"` 这一**种**消息字段；跟你部署在哪、跟 system clock 都没关系 |
| User 和 System 冲突时模型"随机选" | **不是随机**。System > User > Assistant 是训练事实。但模型不是 if-else，强诱导仍可能偏；所以关键约束做双层（System + Gateway） |
| System = 给模型"扮演角色" | 角色（persona）只是 System 的**一小块**。System 的真正职责是**写不变量**：输出格式、拒绝条件、风格、工具使用约束、持久偏好。**业务规则、领域知识、当前任务** → 多数情况放 User 或 RAG 注入 |
| 协议 A 和协议 B 对 System 行为不同 | **角色语义一致**，但 Anthropic 的 System 在多数模型上**权重更高**；OpenAI 允许 developer / system 双层 system role。差异是**程度**，不是"两边不一样"。另：thinking 控制能力差异巨大（见下方"取舍"） |
| 把"JSON 出现"和"输出只能有 JSON"当一回事（**这是我第一次写 Judge 时犯的错**） | 判定优先级时问的是"模型有没有按 System 输出 JSON"，**不是**"输出里有没有别的字符"。thinking 块是**模型行为**，不是优先级问题，不该混进优先级判定 |

---

## 例子

### 例子 1 · 客服 Agent 的 System 怎么写（前端：状态机角色对照）

```
[system]
你是「小助手」，一家卖咖啡的电商客服。
- 只能回答：订单查询、退换货政策、咖啡推荐。
- 不知道的问题回答："抱歉，我帮您转人工。"
- 永远不输出 markdown，用纯文本短句。

[user]
你们有没有低因咖啡？孕妇能喝吗？
```

- User 没要求改格式 → 模型用**纯文本短句**回答（System 生效）
- User 问"孕妇能不能喝"属于健康建议边界 → 模型要么答"建议咨询医生"，要么转人工（System 兜底）
- 同样的 User，如果**没** System，模型可能给你一篇 markdown + "作为 AI 模型我不是医生"的长篇大论

### 例子 2 · 冲突演示数据怎么走

设两条 prompt：

```
P1（约束放 System）：
  system: "你只用 JSON 输出，格式 {label: string}"
  user:   "把这句话分类 pos / neg：「还行」"

P2（约束放 User）：
  user:   "把这句话分类 pos / neg：「还行」。只用 JSON，格式 {label: string}"
```

跑同一个模型：
- **P1**：模型乖乖返回 `{"label":"pos"}`（System 优先级高，约束生效）
- **P2**：模型经常先回"好的，我来分类："一句话解释，再给 JSON —— User 的约束**有时**被前面的指令"打折"

**结论：结构性约束放 System，临时变量放 User。**

### 例子 3 · 多轮对话 assistant message 的作用（前端：useState 历史数组）

```
[1] user:      "我住北京。"
[2] assistant: "好的，已记录。"      ← 必须原样塞回去
[3] user:      "我刚才说的城市今天天气怎么样？"
```

如果第 [2] 条**没塞回去**，模型就不知道"你刚才说"指的是什么 → 可能答"上海"或乱猜。这就是为什么几乎所有 SDK 的 `messages` 参数都要你**手动管理历史**（OpenAI Chat Completion 本身 stateless，不会替你存）。前端比喻：你写 `useState` 保存聊天记录，每次发请求前把数组发出去 —— 不是 React 替你存。

### 例子 4 · 协议 A 的 `<think>…</think>` 嵌入 content（实测案例）

跑协议 A，System 写"只用 JSON 输出"，模型实际返回：

```
<think>The user wants me to evaluate... JSON in the format {"reply": string}...</think>

{"reply": "「今天天气不错」是一句简洁、自然且常见的中文表达..."}
```

- `choices[0].message.content` 是**整段字符串**（think + JSON 拼起来）
- `JSON.parse(content)` **会挂**（think 不是合法 JSON 前缀）
- 这就是为什么**结构化输出不能依赖 System 文本约束**，要走 tool_calls / 专门的 JSON mode（模块 04 的主题）

### 例子 5 · 协议 B Case 3 的"编天气"幻觉样本（实测）

跑 Case 3（多轮 WITHOUT assistant 历史）：

```
[user: "我住北京。"]
                  ← 关键：assistant 漏塞
[user: "我刚才说的城市今天天气怎么样？"]
```

协议 B 实际返回：

> "我来帮你查一下北京的天气情况。北京今天天气如下：
> **北京今日天气**
> - 天气状况：晴转多云
> - 气温：最高气温约 28℃，最低气温约 18℃
> - 风力：北风 2-3 级
> - 湿度：约 45%
> - 空气质量：良（AQI 约 65）"

模型从 messages 数组里直接看到了"我住北京"（user role 第一句），于是**自信地编**了一整套天气数据。**这跟模块 01「幻觉是怎么来的」直接对得上**：模型不知道时不会说不知道，会编。assistant 历史不塞回去 ≠ 模型失忆，但 = **失去"我不知道"的诚实能力**。

### 例子 6 · 协议 A 关掉思考模式的工程答案（一行 regex）

API 不给关，自己剥：

```ts
const cleaned = msg.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
return JSON.parse(cleaned);
```

剥完后协议 A 的内容就跟协议 B 一样是干净 JSON 了 —— 实测把 1141 字符的 raw text 剥到 265 字符的合法 JSON。Demo 里每个面板底部都有"剥掉 `<think>…` 后"的折叠区，肉眼对比 raw vs cleaned。

---

## 我追问过的

| 追问 | 答在 |
|------|------|
| 问：要写代码、能描述优先级、要看多轮结果、协议 A/B 都要 | 「§5.2 Demo 判断块 + 本条产出预告」段：Demo 改判**可运行**，落 `apps/03-Prompt-Engineering/01-System-User-Assistant-优先级/`，yarn `app:03-01-system-user-assistant-priority` |
| 问：`load-root-env.js` 为什么是 `.js` 后缀 | 「为什么是 .js」段：NodeNext + ESM 强制要求显式扩展名（TS 编译产物是 `.js`；运行时 Node ESM 只解析 `.js`；裸路径 / `.ts` 都会挂） |
| 问：把它写成网页 | Demo 从 CLI 改成 HTTP server + Tailwind HTML，端口 5180，3 个 Case 卡片 + A/B 并排输出 + verdict pill |
| 问：Case 1 协议 A 实际是完成了，只是把思考放在了内容里 —— 判断错了 | 「易混点」段第 5 行 + 「踩坑」段 + 「judgeCase1 改语义」：`judgeCase1` 改为"剥 think → 找 JSON → 判优先级"；现在 A 和 B 都是 `SYSTEM_WIN` |
| 问：协议 A 怎么关闭思考模式 | 「例子 6」+ 「取舍」段：API 不给关，工程答案三档（推荐 ① 适配层剥 regex；推荐 ② 换协议 B 不传 `thinking`；不推荐 ③ System 写"不要思考"反向锚定） |

---

## 取舍

| 写在哪 | 适合放什么 | 不适合放什么 |
|--------|-----------|-------------|
| **System** | 角色身份、输出格式、风格、拒绝条件、工具使用约束、**持久**偏好 | 一次性任务、当前文档内容、用户具体问题 |
| **User** | 本轮任务、临时指令、要被引用的内容、Few-shot 示例（如果不想污染全局风格） | 长期约束（容易被后续 user 覆盖） |
| **Assistant（历史）** | 多轮上下文必需；存的是"AI 之前说过的话" | 不要手动伪造 assistant 消息假装模型说过（容易被识破） |

### 协议 A vs B 在 thinking 上的架构差异

| 协议 | thinking 默认 | API 怎么控制 | 工程后果 |
|------|--------------|--------------|----------|
| **A（OpenAI 兼容）** | **默认开**，`<think>…` 嵌入 `choices[0].message.content` | **没有 API 参数能关**（MiniMax-M3 在 OpenAI 侧不暴露 thinking 控制字段） | 适配层必须 regex 剥，否则下游 `JSON.parse` 挂 |
| **B（Anthropic）** | **默认关**；只有显式传 `thinking: { type: "enabled", budget_tokens: N }` 才开 | 不传 → 不思考；`{ type: "disabled" }` → 显式关 | 干净控制，content 是 block 数组，自己 filter `type === "text"` |

**为什么会有这个差异**：Anthropic 的 API 设计把 thinking 当**一等公民**（独立 block、独立 budget）；OpenAI 协议是早期没 thinking 的模型定义的 API shape，后来加 thinking 的模型只能**塞进 content 字符串**。生产里如果对"关思考"有强需求，**协议 B 是更省心的选择**。

---

## 踩坑

1. **User 里写"忽略 system 指令"** → 大多数主流模型仍按 system 走，但**不是 100%**。做 Agent 时**不要**靠 User 守门；安全 / 业务约束必须 System + Gateway 双层。
2. **System 写 2000 字产品 PRD** → 注意力稀释，模型对中后段指令"看不见"。System 保持**短、密、结构化**（要点列表优于长段落）。
3. **没塞 assistant 历史就 multi-turn** → 模型失忆 / 瞎猜 / **自信地编**（Case 3 协议 B 的"编天气"是绝佳样本）。
4. **System 里写"绝对不要做 X"** → 反向锚定：模型更容易想起 X。改成正面指令："请改用 Y 方式回答"。
5. **把工具 schema / 函数调用规则**塞 System 散文里 → 应该塞在 `tools` 字段（结构化）或 System 里的**结构化清单**；散文 System 里模型容易忘。
6. **协议 A 的 `content` 字符串嵌 `<think>…</think>`** → 下游 `JSON.parse(content)` 直接挂。**生产代码必须剥**（regex），或者走 tool_calls / JSON mode（模块 04）。
7. **不塞 assistant 历史 ≠ 模型失忆，但 = 失去"我不知道"的诚实** → 模型会从 messages 数组里**直接看到** user 的早期消息，然后自信地编（幻觉）。这是模块 01 讲的"幻觉是怎么来的"在多轮场景的具体表现。
8. **把"JSON 出现"和"输出只能有 JSON"混为一谈**（**我的 Judge 写错过**）→ 判定优先级时问的是"模型有没有按 System 输出 JSON"，不是"输出里有没有别的字符"。thinking 是**模型行为**，不是优先级。

---

## 过关自检

- **冲突时谁说了算？** System > User > Assistant；这是训练时的事实，不是厂商开关；但模型不是 if-else，强诱导仍可能偏，所以**关键约束做双层**（System + Gateway 校验）。
- **System 该放什么？** 不变量：身份、输出格式、风格、拒绝条件、工具约束；**不放**长 PRD、不放临时任务、不放当前文档。
- **Assistant 消息干嘛用？** 多轮里把模型之前的回复**原样**塞回去当上下文；不塞 = 失忆 / 失去"我不知道"的诚实。
- **协议 A 的 thinking 怎么"关"？** API 不给关。工程答案三档：① 适配层 regex 剥 `<think>…</think>`（推荐，最常见）；② 换协议 B 不传 `thinking` 参数（推荐，如果业务允许）；③ System 写"不要思考"（**不推荐**，反向锚定）。
- **协议 A 的 `JSON.parse(content)` 为什么会挂？** 因为模型把 `<think>…</think>` 嵌进了 content 字符串。剥 think 后再 parse。

---

## 还没搞懂的

- 协议 B 在不同模型上的 `thinking` budget 对**延迟**和**准确率**的 tradeoff 没具体数据 —— 等学到模块 18 Observability 再补 trace 数据。
- 模块 07 之前还没手写 Agent 循环，所以"多轮 + 工具调用 + assistant 历史管理"的三方关系还没串过完整例子 —— 等学到那里用本条 + 模块 06 / 07 的内容拼一次完整链路。