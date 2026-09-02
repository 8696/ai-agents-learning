# **CoT / ReAct（概念）**：先知道思想；循环到模块 07 再写

> 对应模块：[模块 03 · Prompt Engineering ⭐⭐⭐⭐](./README.md) · 小节进度第 3 条
> **来源**：本对话（2026-09-02 首次沉淀）
> **状态**：已沉淀

## 是什么

本条要讲两个东西：**CoT** 和 **ReAct**。它们都是 Prompt Engineering 时代的招数，今天几乎所有 Agent 框架（LangGraph / AutoGen / Claude / OpenAI 的 tool use 编排）背后都能看到它们的影子。Agent 开发是 CoT → ReAct → Tool Calling（§5）→ Agent Loop（§7）一路演化下来的。

### CoT = Chain of Thought（思维链）

**一句话：让模型把"思考过程"显式写出来，再给最终答案。**

Wei et al. 2022（Google Brain）提出。核心 trick 简单到离谱：在 prompt 里加一句 `Let's think step by step`，多步推理任务准确率就能飙一截。后来 Kojima et al. 2022 证明，**零样本**情况下这句"step by step"也能拉到很好的效果（叫 **Zero-shot CoT**）；Wei 最早那版要带几个推理链示例（叫 **Few-shot CoT / Manual CoT**）。

写法分两层：

| 形式 | 怎么写 | 何时用 |
| --- | --- | --- |
| **Zero-shot CoT** | Prompt 末尾加一句"Let's think step by step"（或"让我们一步步思考"），让模型自己生成推理过程 | 任务简单多样、没空给示例 |
| **Few-shot CoT** | 给 3~5 个示例，每个示例都是"问题 → 推理步骤 → 答案"三段 | 任务格式固定、要稳定输出可控的推理样式 |

差别：Zero-shot 是把"思考开关"打开；Few-shot 是把"思考模板"展示出来给你看。

### ReAct = Reason + Act（推理 + 行动）

**一句话：让模型"思考 → 调工具 → 看结果 → 再思考"循环往复，而不是一次性把答案憋出来。**

Yao et al. 2022（Princeton）。它解决的是 CoT 解决不了的问题：**模型没法知道它不知道的事**。比如"明天北京下不下雨"，模型只能瞎编；除非能调一个真实天气 API（Action），拿到真实结果（Observation），再继续推理（Thought）。

一个完整的 ReAct 轨迹长这样（**注意本条只认识这个轨迹长什么样，循环代码是 §7 才写的**）：

```text
Thought 1: 我不知道明天北京的天气，需要调用天气工具查一下。       ← 想
Action 1:  get_weather(city="北京", date="2026-09-03")               ← 做
Observation 1: {"condition": "晴", "temperature_max": 28, ...}      ← 看
Thought 2: 天气晴，不会下雨，不必带伞。                              ← 再想
Action 2:  Finish(reply="明天北京晴，28 度，不用带伞。")              ← 收尾
```

`Thought` / `Action` / `Observation` 三个标签反复出现，循环直到模型觉得可以给出最终答案（`Finish` 是 Action 的一种特例）为止。

## 为什么（Agent 开发要懂）

不懂这两条，今天写 Agent 会具体踩这些坑：

1. **不懂 CoT → 跳步骤答题**：你让模型做"看完合同再判断是否违约"，模型会一句话给判断，错得让你怀疑人生；加一句 step by step 立刻好得多。这是 2026 年还有人忽视的"免费午餐"。
2. **不懂 ReAct → 当模型是全知的**：问"用户上次什么时候买的我们的产品"，期待它能直接答——它只会编（就是模块 01 学的"幻觉"）。ReAct 是**给 LLM 装上手**的设计范式。
3. **后续模块全靠它**：
   - §5 Tool Calling 是 ReAct 里 Action 那一步的工程实现（怎么传 `tools` 字段、模型怎么返回结构化调用请求）。
   - §7 手写 Agent 是 ReAct 的代码实现（while 循环何时停、错了几次熔断）。
   - §13 Agent Framework（LangGraph 等）的底层抽象就是 ReAct + 状态机的组合。
4. **判断力**：学完 CoT / ReAct 之后，看到任何"Agent 产品"你都能反推——它循环一次还是多次？Action 是 tool calling 还是 shell？Observation 是结构化还是自由文本？这是 Agent 开发者的第一层"语言"。

## 易混点

| 组 | 差在哪 | 判错会怎样 |
| --- | --- | --- |
| **CoT vs Few-shot** | Few-shot 是"给示例让模型模仿**格式**"；CoT 是"给带推理链的示例让模型模仿**思考方式**" | 简单分类只给格式示例就够；数学/阅读理解不附推理链，模型就会跳步骤 |
| **CoT vs thinking 字段（§2 学过）** | thinking 是**协议机制**——`reasoning_effort=high` 让模型自己决定想多少；CoT 是 **Prompt 技术**——你硬要求它一步步想。可见性也不同：thinking 落到 `reasoning_content`（默认隐藏）；CoT 落到正文 `assistant.content`（用户能看到） | 想省钱用 thinking：模型自己省；想稳用 CoT：每次都按你的模板来 |
| **ReAct vs Tool Calling** | Tool Calling 是**协议名**——`tools` 数组怎么传、`tool_calls` 字段长什么样；ReAct 是**设计模式**——Thought/Action/Observation 怎么交替、循环怎么停 | 把两者混了就会搞错前提：Tool Calling 是 API 给你的能力，ReAct 是你用这种能力的方式 |
| **ReAct vs 任务规划（Plan-and-Execute）** | 规划是一次性列完所有步骤然后执行；ReAct 是每步只决定下一步做什么 | 决策链长 / 后一步依赖前一步结果的任务，规划会僵死；ReAct 边走边看更稳 |
| **CoT vs ReAct** | CoT 只"想"不做；ReAct 想 + 做 + 看 | LLM 单干的任务用 CoT；需要外部信息/工具的任务用 ReAct |

记住一句：**CoT 是 ReAct 里 `Thought` 那一步的老祖宗**。ReAct 把 CoT 加上 Action + Observation 两条腿，就成了 Agent 的最小骨架。

## 例子

### CoT 例子 1：小学生数学题（生活）

**问题**：`小明有 5 个苹果，吃了 2 个，妈妈又给了 3 个，现在几个？`

不 CoT：

```text
Q: 小明有 5 个苹果，吃了 2 个，妈妈又给了 3 个，现在几个？
A: 7
```

直答会错（7 是猜的，没过程）。

CoT（Zero-shot，加 step by step）：

```text
Q: 小明有 5 个苹果，吃了 2 个，妈妈又给了 3 个，现在几个？Let's think step by step.
A: 先用 5 减去 2，得到 3 个苹果。再加妈妈给的 3 个，得到 6 个苹果。所以答案是 6。
```

模型把过程显式说出来，错率掉一大截——这就是"思维链"的威力。

### CoT 例子 2：评论分类（前端/工程）

**任务**：判断一段用户评论是"正面/负面/中性"。

不 CoT 直接分类：

```text
评论: "产品不错，但物流太慢了，两周才到。"
判断: 正面
```

模型看着"不错"就答正面——但用户其实在吐槽物流。一句话分类肯定翻车。

用 CoT：

```text
评论: "产品不错，但物流太慢了，两周才到。"

让我们一步步分析:
1. 提取正向词: "不错"（表扬产品质量）
2. 提取负向词: "太慢"、"两周才到"（抱怨物流）
3. 判断倾向: 正向负向都有，负向更具体（"两周才到"是事实投诉）
4. 最终判断: 负面（投诉为主，夸赞是次要）

结论: 负面
```

模型被迫过一遍"提取 → 倾向 → 结论"，每一步能被你看、能被 retry、能被 Judge 打分。这就是工业级 LLM 应用里 CoT 的核心价值——**让推理过程可观测、可评测**。

### ReAct 例子 1：查天气（生活）

**任务**：明天北京天气怎么样？要不要带伞？

纯 LLM（无 ReAct）：

```text
答: 明天北京可能有小雨，建议你带把伞。
```

——它**不知道**明天北京天气，这就是模块 01 学的"幻觉"的一种来源。

ReAct：

```text
Thought 1: 我不知道明天北京的天气，需要调用天气工具查一下。
Action 1:  get_weather(city="北京", date="2026-09-03")
Observation 1: {"condition": "晴", "temperature_max": 28, "humidity": 40}

Thought 2: 天气晴，不会下雨，不必带伞。
Action 2:  Finish(answer="明天北京晴，28 度，不用带伞。")
```

差距立现：**不是模型变聪明了，是模型拿到了地面真相**。这就是 ReAct 之所以是 Agent 起点的根本原因。

### ReAct 例子 2：查用户在线状态（前端雏形）

**任务**：用户"张三"在不在后台？

```text
Thought 1: 我不知道张三的账号状态，需要查数据库。
Action 1:  db.query(table="users", where={name: "张三"})
Observation 1: [{id: 1024, name: "张三", status: "active"}]

Thought 2: 张三在后台，状态是 active。
Action 2:  Finish(answer="张三在后台，当前在线。")
```

§7 写代码时，这个**轨迹**就是 while 循环的每个 tick；`Action` 是 §5 要学的 tool calling；`Observation` 就是工具返回的字符串。

## 取舍

### 什么时候用 CoT？

- 任务需要多步推理（数学、阅读理解、因果分析、复杂分类）。
- 需要把推理过程露出来给用户看，或者给后续模块当评测依据。
- 想要"几乎零成本"提准确率（比换模型便宜）。

### 什么时候用 ReAct？

- 任务需要**真实世界或私有数据**（天气、订单、CRM、日志、文件）。
- 任务需要**操作副作用**（发邮件、写库、调内部 API）。
- 答案质量"必须"由工具提供 ground truth，不能让 LLM 编。

### 什么时候**都不**用？

- 简单单步任务（"把这段话翻成英文"）——加 CoT 反而拖慢、可能引入幻觉。
- 任务已经被前置数据完全准备好，模型只要做"摘要"——直接给 Prompt 即可。
- 你还没法在工程上实现 tool 调用闭环时（先做 CoT / Few-shot 把效果拉满，§5 再升级到 ReAct）。

### 一句话选型

**能离线想清楚的 → CoT；需要外部信息才能做对的 → ReAct。**

## 踩坑

1. **CoT 加在错的位置**：把 CoT 放进 System Prompt 而不放进具体任务的 User Prompt 附近 —— 模型当成"人设说明"忽略。要把"Let's think step by step"放在**那道题旁边**。
2. **ReAct 循环里忘了限步**：模型偶尔会一直 Thought 不到满意答案，耗 token 烧预算。本条不讲实现，但**心智上要记住**：真循环一定有 max_steps 兜底（§7 会写）。
3. **把 CoT 文本当成产品功能暴露给用户**：CoT 是过程，过程里有错很正常；要展示给用户前要么事后校验，要么整理成"理由"再展示。
4. **ReAct 里 Observation 设计成自由文本**：动作做完了结果应该是结构化（JSON / 表格），别让 LLM 自己去解析一大段 HTML / 自然语言——这是 §7 / §4 都会反复出现的工程问题。
5. **混淆 ReAct 和"任务规划"**：误以为列个 ToDo List 让模型照着做就叫 Agent。规划是一次性、易僵死；ReAct 是边走边看、扛动态。

## 过关自检

对照本条「要能讲清」——能说清思想，现在不要实现 Agent Loop：

- 能用一句话说出 **CoT = 显式写出推理步骤**；并说出 **ReAct = 思考 + 调工具 + 看结果 + 再思考 的循环**。
- 能说出 CoT 的两种形式（Zero-shot / Few-shot）各自的写法与适用场景。
- 能区分 CoT 和 Few-shot、CoT 和 thinking 字段、ReAct 和 Tool Calling、ReAct 和任务规划这四组易混。
- 能口头复述"ReAct 轨迹"长什么样（Thought 1 → Action 1 → Observation 1 → Thought 2 → … → Finish），并明确指出实现循环是 §7 的事。

## 还没搞懂的（先记住，§5/§7/§13 会闭环）

- **Action 字段怎么强结构化**：ReAct 写起来容易，让模型每次都按 `Action: 工具名[参数]` 格式稳定返回很难。**§4 Structured Output** / **§5 Tool Calling** 会从协议层把它锁死。
- **Observation 应该回什么粒度**：是把工具返回全文塞回去，还是模型读完做个摘要？§7 手写循环时会讨论。
- **循环什么时候停**：模型不知道"够了"就停不下来。§7 会引入 `Finish` Action、max_steps、token budget 三道阀门。
- **ReAct vs State Machine**：上面 ReAct 讲的是最朴素版本，复杂任务会引入"规划 → 执行 → 评估"的 Plan-Execute-Reflect 三段式，这是 §13 / §11 的范畴。

本条**只能**让你"知道这两个东西是什么、为什么重要、像什么时候该用"；**不会**让你写代码。§7 写。
