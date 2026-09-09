# **Context vs Memory**：本次请求塞进 messages 的，vs 跨会话存起来的

> 对应模块：[模块 06 · 多轮对话 & Context Engineering ⭐⭐⭐⭐⭐](./README.md) · 小节进度第 1 条
> 本条学完后由 Coach 按本对话已讲过的全部写入；学习者只减不加。

- **来源**：本对话（2026-09-09 `coach start` + 落 step-1 + 维护 [agents/05-demo.md §5.3.16](../../agents/05-demo.md#5316-详细日志强制) 详细日志 / 烟雾测试 / 写法模板 + [AGENTS.md §5.6](../../AGENTS.md#56-详细日志高频错误表层摘要) 摘要）
- **状态**：已沉淀

---

### 是什么

**Context（上下文）**：本次请求塞进 `messages` 数组里的全部内容。它跟这一次「问 → 答」绑定，结束就消失。

**Memory（记忆）**：跨会话（跨次请求 / 跨天 / 跨用户）持久化的东西。下次会话开始时还会被找回来。

口诀：**Context 是「这一桌的菜」，Memory 是「我上次给你写的小卡片」。** 这桌菜吃完撤了；小卡片在抽屉里。

`messages` 数组 = `[{role, content}, ...]`（OpenAI 协议 A 字段名；协议 B 是 `messages: [{role, content}, ...]` 同样形状），往模型里塞的列表，长度上限叫 **context window**（模块 01 第 3 条讲过）。**模块 06 整条路线解决的就是三件事**：这一桌菜怎么摆、摆不下怎么办、要不要让厨师记住客人上次点过什么。

#### 核心对象不是单一概念，是分类（讲完前已扫变体）

| 核心对象 | 变体 | 是什么 | 例子 |
|----------|------|--------|------|
| **Context** | C1 · System 段 | 产品规则 / 角色设定 | "你是 XX 客服" |
| | C2 · 多轮消息 | 本会话的 user/assistant 交替 | "上轮用户问 X，本轮问 Y" |
| | C3 · Tool result | 工具调用结果回灌 | "订单号 OD-... 已查，金额 299" |
| | C4 · 附件 / 多模态 | 图片 / 文件 / RAG 召回段落 | "用户上传截图" / "RAG 召回段落" |
| **Memory** | M1 · 事实 | 用户的客观属性 | user_name=Tina、注册时间 |
| | M2 · 偏好 | 用户喜欢 / 不喜欢什么 | 不喜欢推销 X 套餐 |
| | M3 · 技能 / 工作流 | 用户的工作方式 | 用 Rust、注释中文 |
| | M4 · 工作记忆 | 用户当前项目的状态 | "在做一个电商后端" |
| | M5 · 历史检索 | 跨会话找上次说过的话 | "上次你说……" |
| **Memory 操作** | O1 · 写入 | 何时把什么存起来 | 用户说"我叫 Tina" → 写 M1 |
| | O2 · 读取 / 注入 | 下次会话开头取出来塞 system | 取 user_name 注 "用户 Tina" |
| | O3 · 更新 / 覆盖 | 用户改主意 | "其实我叫 Tina Lee" → 覆盖 M1 |
| | O4 · 删除 / 遗忘 | 用户要求清空 | "忘掉之前所有" |

> 变体 C2 的「裁剪」（压缩 / 摘要 / 滑动窗口）是模块 06 第 2 条教学点；C1-C4 的「Token Budget 一起算」是第 3 条。**本条只点变体不展开裁剪。** M1-M5 的存储选型（SQLite / 向量库 / 容量策略）是模块 10 Memory；Memory 何时由 Agent 哪一拍写是模块 07 手写 Agent。本条**留接口**给后续条，**不重复展开**。

---

### 为什么（Agent 开发要懂，踩过三类翻车才懂）

混淆这两件事的代价是真实的：

1. **把长期信息塞 Context** —— 把用户「3 个月前说过不要推销」每次都塞进 system prompt。浪费 token、污染 context window；用户改主意后那条信息"幽灵"般留在那里，模型不敢反驳。
2. **把短期对话塞 Memory** —— 把「这轮用户在表单里填的临时值」写进数据库。下次会话再调出来注入，模型以为用户偏好就是这次填的临时值——典型"模型记住我一次购物车 = 我天天要买这个"。
3. **不知道裁剪对象** —— context window 装不下时，开发者的第一反应是「把旧消息存到 Memory，下次再调出来」。但「旧消息」属于 Context（本会话内的对话历史），不是 Memory（跨会话事实）。裁剪应该是「摘要」或「滑动窗口」，**不是**"写进 Memory"。这条易混点模块 06 第 2 条会专门讲。

简言之 —— **Context 决定「这一轮模型看得到什么」；Memory 决定「模型下一次还记不记得你」。两件事用两套机制解决；混了要么浪费钱、要么漏信息。**

---

### 易混点

#### Context vs Session vs History vs State

| 名词 | 是什么 | 跟 Context 的关系 |
|------|--------|------------------|
| **Context** | 本次请求塞进 messages 的全部内容 | — |
| **Session** | 一次完整会话（用户从开窗口到关窗口的全部消息） | Session 的全部历史 = Context 的原料；本次 Context的 = Session 的「当前切片 + 摘要」 |
| **History** | 通常指「本次会话内的对话记录」（跟 Session 几乎同义） | 容易和 Memory 混；**判断标准**：History 是不是跨会话？跨 = Memory 候选 |
| **State** | Agent 内部维护的运行时对象（当前轮次、已调用工具、累计 token） | State 一般**不进** Context（属于实现细节）；但 State 里某些字段（如"对话已进行到第几轮"）有时会被包装成 system 提示注入 |

**判错会怎样**：把 Session 当 Memory → "我想清空会话结果把 Memory 也清了" 或 "我以为我之前说过的事还在，其实已经被裁掉了"。

#### Context vs RAG

- RAG = 检索增强生成。文档先向量化存起来，问的时候召回相关段落塞进 messages。
- **RAG 是给 Context 添砖**（一次性检索回来的内容也是本次请求 messages 的一部分），不是 Memory。
- 区别：RAG 的知识库是**共享静态语料**（公司文档 / 产品手册）；Memory 是**这个用户**的私人持久化信息。

**判错会怎样**：把"用户上次问过什么"塞进 RAG 知识库，结果下次别的用户检索时命中你的私人对话 —— **隐私事故**。

#### Memory vs Fine-tuning

- Fine-tuning = 改模型权重，长期影响所有调用。
- Memory = 运行时注入某次 / 某些次请求。
- **Memory 是用户的；Fine-tuning 是厂商的**。你不能 fine-tune 一个第三方 API 模型去记某个用户的事；只能把那个用户的事存到 Memory，每次问他之前取出来注入。

**判错会怎样**：以为"调 API 调多了模型就学会了" —— 模型权重不会因为你调它而改。

#### 与模块 05 / 01 / 03 已学概念的边界

- **模块 05 Tool Calling**：tool_result 也是 Context 的一部分（`{role: 'tool', content: ...}`）。属于"本轮产生的临时数据"，不算 Memory。
- **模块 01 Context Window**：是 Context 的「长度上限」，不是 Context 本身。Context 超了才有模块 06 第 2 条「压缩 / 滑动窗口」的事。
- **模块 03 System Prompt**：是 Context 的一部分（`role: 'system'`），但通常**不是** Memory。System 是"这条产品线的规则"；想改规则改 system；想记某个用户改 Memory。

---

### 例子

#### 例子 1 · 客服场景（Context + Memory 配对）

**场景**：用户 Tom 周一找客服问"我上个月买的 X 套餐怎么退款"。

- **Context（本会话的 messages）**：
  - system: "你是 XX 客服，按以下流程回答……"
  - user: "我上个月买的 X 套餐怎么退款？"
  - assistant: "请问订单号？"
  - user: "OD-2025-0817-001"
  - tool: `{order_id: "OD-...", amount: 299, status: "已付款未发货"}`
  - assistant: "可以全额退款……"

  会话结束，**这些消息没了**。下次 Tom 来问别的，模型看不到这些。

- **Memory（跨会话存起来）**：
  - 用户偏好：`{no_marketing: true}`（Tom 8 月 1 日设置过"别再推销 X 套餐"）
  - 跨会话事实：`{last_complaint: "2026-08-17 问过退款，已处理"}`（也许有用，也许只在某些场景调出来）

  下次 Tom 开新会话：注入 system "用户 Tom，偏好 no_marketing=true"，模型这次不推销 X。

#### 例子 2 · 前端类比（State vs localStorage）

前端 React 同学的天然直觉：

- **Context ≈ React 组件 props + state**：本次渲染能看见的。
- **Memory ≈ localStorage / IndexedDB**：跨刷新、跨会话持久化。

**判错会怎样**：把 React state 直接当持久化用 → 刷新页面全没了；把 localStorage 当 state 用 → 改了之后所有页面实例不同步。

把 React 类的迁移过来就行 —— 你写 React 时已经天然区分这俩了。

#### 例子 3 · 编程助手（Context 是当前文件，Memory 是用户偏好）

Cursor / Copilot 的实现思路：

- **Context**：当前打开的文件、当前光标位置、本次会话里的对话。
- **Memory**：用户设置（"用 Rust"、"函数不超过 50 行"、"注释用中文"）—— 注册时的偏好，跨会话注入。

Cursor 在你新开一个空项目时仍然记得你"用 Rust" —— **那就是 Memory 在工作**。

#### 例子 4 · 关键易混的反向例子（判错会怎样）

| 写错的样子 | 出错 |
|-----------|------|
| 把"用户上次说不要推销"塞 system（每次都塞） | 浪费 token + 用户改主意后无法撤回 |
| 把"这一轮用户填的购物车"写进 Memory DB | 下次会话注入，模型以为用户天天要买这个 |
| 把"对话历史"当成 Memory，每次会话开始全量注入 | 上次会话的废话全部灌进新会话，context window 直接炸 |
| 把"用户跨会话的事实"塞 Context 当 system | 用户信息泄露给同一 system 下的其他用户（多租户场景灾难） |

#### 例子 5 · 验证 step-1 没 Memory 的方法（实验）

`apps/06-多轮对话与Context/01-Context-vs-Memory-step-1/` 是当前 demo：输入框 + 发送 + 清空 + 演示上游失败。

**亲手验证 step-1 没 Memory**：

1. 起服务：`cd apps && yarn app:06-01-context-vs-memory-step-1`
2. 浏览器发："请你先记住我叫 Tina"
3. 模型答 "好的 Tina"
4. 再发："我叫什么？"
5. 模型答 "Tina" —— 看着像"记住了"
6. **关掉浏览器标签页，重新打开**
7. 发："我叫什么？"
8. 模型答 "我不知道你叫什么" —— **这就证明没有 Memory**

第 5 步看着像记忆，其实只是**前一次会话的 messages 还活在 React state 里**，下一次发送时把整包发回给模型，模型看到第 2 轮才知道。**这是 Context 在累积，不是 Memory 在生效。**

第 8 步模型不记得 = **没跨会话持久化 = 没 Memory**。step-2 才加 SQLite 持久化；届时重做这个实验，第 7 步会得到 "Tina" → **证明 Memory 生效**。

---

### 需求清单

需求清单是**验收准绳**（[AGENTS.md §1 底线 3](../../AGENTS.md#1-角色) + [06-teach.md §6.2 item 6](../../agents/06-teach.md#62-概念讲解任意终端--外部节奏)）；不是 step 生产的驱动器。step 生产仍按本节知识动态推进（[§5.3.14](../../agents/05-demo.md#5314-demo-子节拆分动态引导由浅入深新)）。`coach complete` 勾 ✅ 时按需求逐条对闸门 3。

#### 需求 1 · 多轮对话里保留本会话上下文（C2）

- **业务场景**：客服 / 助手 / 编程伙伴。
- **目标**：用户问 "订单 OD-... 的金额是多少？" → 模型答。**紧接着**用户问 "那能退款吗？" → 模型记得"上一轮刚查过 OD-..."，不再问订单号。
- **涉及知识点**：Context（messages 数组 C2）。
- **验收标准**：页面发 2 条连续消息，第 2 条模型引用第 1 条的实体；服务端日志能看到两次请求的完整 messages 数组。

#### 需求 2 · 跨会话持久化用户偏好（M2 + O1 + O2）

- **业务场景**：用户第一次对话说"以后回答用中文"；关掉窗口第二天再来。
- **目标**：第二次会话模型主动用中文回答，且不弹"请告诉我你的偏好"。
- **涉及知识点**：Memory（M2 偏好）+ 操作（O1 写入 + O2 注入）。
- **验收标准**：第一次对话显式确认偏好已写入；第二次会话打开页面（无 messages），首条消息发出去，模型用中文回答；服务端日志能看到 system 里有 "用户偏好：中文" 这一句是从 Memory 注入的（不是写死）。

#### 需求 3 · 用户中途改偏好触发覆盖（M2 + O3）

- **业务场景**：用户先说"用中文"，又说"算了用英文吧"。
- **目标**：模型立刻切英文，不再用中文；且第二次会话也用英文。
- **涉及知识点**：Memory（M2）+ 操作（O3 覆盖）。
- **验收标准**：本会话第 2 条消息起模型切语言；第二次会话（重新打开页面）首条仍英文；服务端日志能看到 Memory 写入/覆盖事件。

#### 需求 4 · 用户要求"忘掉之前"触发删除（O4）

- **业务场景**：测试 / 隐私场景。
- **目标**：用户说"忘掉之前所有"，模型确认并清空；之后问到"我叫什么名字"模型答"我不知道"。
- **涉及知识点**：Memory 操作 O4。
- **验收标准**：清空动作有日志；之后请求 system 里没有用户信息；页面有可视的"已清空"反馈。

#### 需求 5 · 长对话超长时看见 context window 压力（C2 触发，留给模块 06 第 2 条）

- **业务场景**：用户连续聊 50+ 轮，最早的消息已经超过 context window 上限的 60%。
- **目标**：模型仍能工作，不报错、不漏关键信息。
- **涉及知识点**：Context 长度管理（接口给第 2 条「压缩 / 摘要 vs 滑动窗口」、第 3 条「Token Budget」）。
- **验收标准**：本条不要求实现裁剪算法（那是第 2 条的活）；只要求**看见**完整 messages 数组 + 总 token 数 → 学习者亲眼看到"原来这就是 context window 压力"，为第 2 条打地基。

---

### 取舍

| 选择 | 优劣 |
|------|------|
| **Memory 写入触发时机** | 自动（消息里匹配"我叫 / 我偏好"模式）vs 手动（按钮"记住"）。自动易上手但容易误抓；手动可控但步骤多。**新手先手动** —— 验证链路通了再上自动。 |
| **Memory 存什么** | 全部 KV 进 SQLite vs 加向量召回（模糊匹配"上次聊过类似话题"）。**新手先 KV** —— 模块 10 再学存储选型。 |
| **System Prompt vs Memory 注入** | 静态产品规则写死在 system prompt；用户相关动态信息从 Memory 拼到 system 末尾。**绝不要**把所有 Memory 都写死进 system —— 用户改主意后改不动。 |
| **Memory 跨用户边界** | 单用户 demo = 全局 SQLite 一张表；多用户产品 = 按 user_id 分表 + 注入时严格按 user_id 过滤。**多用户场景必须 user_id 隔离**，否则隐私事故。 |

---

### 踩坑

#### 1. 把"对话历史"当成 Memory 全量塞进新会话（最常见）

- 表现：用户上一次聊了 50 轮，全量进 Memory，新会话一开头 context window 就炸。
- 解法：Memory 只存**事实 / 偏好 / 工作记忆**，**不存会话历史**。会话历史 = Context，按本条规则累积（最多就是这一桌菜），不跨会话。

#### 2. 把"本轮临时数据"写进 Memory DB

- 表现：用户填了一次表单，DB 永久记为"用户偏好 = 这次填的值"。下次会话模型以为这就是用户偏好。
- 解法：临时数据 = Context（role 在前端 React state 里），**写 Memory 前问自己**"用户下次开新会话还希望模型知道吗？" 答否 = 别写。

#### 3. 把"用户跨会话事实"塞 Context 当 system（多租户灾难）

- 表现：多个用户共用一个 system prompt，事实直接拼进 system → 用户 A 的姓名 / 偏好泄露给用户 B。
- 解法：Memory 按 user_id 隔离 + 注入时严格按 user_id 取；**永远不要**"图省事"把用户相关字段写死到 system prompt。

#### 4. 服务端日志路径写错（今天踩坑 · 2026-09-09）

- 表现：服务跑、console 输出正常，但 `apps/{demo}/logs/{YYYY-MM-DD}.log` 下没文件 / 文件在错位置。
- 原因：`createLogger(logDir)` 接收路径字符串；demo 的 `lib/logger.ts` 在 `apps/{demo}/lib/`，写路径时 `new URL("./logs/", import.meta.url)` 解出来是 `lib/logs/`（不在 demo 根目录下）。
- 解法：必须写 `path.resolve(__dirname, "..", "logs")`（logger.ts 在 `lib/` → `..` 跳回 demo 根目录）。
- 验证：起服务那一刻 `server.start` 已写日志 → 看 logs/ 文件夹在不在 + 文件大小 > 0 = 路径 OK。详细：[agents/05-demo.md §5.3.16](../../agents/05-demo.md#5316-详细日志强制)。

#### 5. 日志"看着正常"但实际没落地（今天踩坑 · 2026-09-09）

- 表现：服务端 console 一切正常，模型响应正常，但日志文件没生成 / 生成在错位置。
- 原因：`fs.appendFileSync` 在 `try/catch` 里静默吞失败；console 输出走 `console.log`，跟文件写入是两条独立路径。
- 解法：必须 ls 文件 + 看 mtime 跟 `date` 比（grep 文本容易拿到旧 entry）。**console 输出不能替代文件验证**。详细：[agents/05-demo.md §5.3.16 烟雾测试](../../agents/05-demo.md#5316-详细日志强制)。

#### 6. 烟雾测试用默认端口撞学习者 demo（今天踩坑 · 2026-09-09）

- 表现：agent 跑烟雾测试时 `yarn app:xx` 起服务占了默认 50038，跟学习者正在跑 demo 撞端口。
- 解法：烟雾测试**必须**用 `PORT=31001` 临时端口（3 开头约定 31000~31999，跟学习者的 50000+ 永不撞）。**禁止**用 `yarn app:` / `preview_start` 跑烟雾测试（都默认 50038）。

---

### 契约记录（操作类不进「我追问过的」节）

- 「写规则到 `agents/` 而不是当前小节」—— 学习者指示：**规则类约束（写法模板 / 烟雾测试 / 端口约定）写进 `agents/05-demo.md` §5.3.16 + `AGENTS.md` §5.6 摘要**，不进当前小节 MD（不进 `apps/{demo}/README.md` 或本 MD）。本节作为契约留痕。
- 操作类追问（「写到 Agent 里」「按 A 走」「端口 xxxx」「用什么协议」）不沉入「我追问过的」，挪「契约记录」或「踩坑」或独立处理。

---

### 我追问过的（按 §2.6 筛门留 4 条）

| 问题 | 针对什么 | 回答 |
|------|---------|------|
| 「现在 step-1 有记忆吗」 | 区分 Context / Memory 在代码里怎么分 | **没有**。step-1 只有 routes/health.ts + routes/chat.ts + routes/error-demo.ts + lib/logger.ts + lib/http/runtime-ctx.ts + public/index.html，**没有任何 db.ts / store.ts / sqlite.ts / memory.ts**。前端的 messages 是 React state（Context）；服务端的 messages 是请求 body（Context）。两个都不是 Memory。**实验验证**：刷新页面 → 模型答"不知道" → 证明没 Memory。详见「例子 5」。 |
| 「这是不是拷贝的顶层日志代码？下次怎么避免这个发生？」 | 顶层 logger.ts 跟 demo logger.ts 的边界 + 路径写错怎么发现 | **是拷的**（§5.3.16 硬规则：每个 demo 必须自带完整 `lib/logger.ts`，禁止运行时 import 顶层）。**bug 出在我自己加的 `export const logger = createLogger(...)` 这一行**（顶层只 export 工厂函数 `createLogger`，路径 demo 自己定）。**写法模板**：`path.resolve(__dirname, "..", "logs")` 配合 `import { fileURLToPath } from "node:url"`。**唯一验证方法**：起服务那一刻 `server.start` 已在写日志，看 logs/ 在不在 + 文件大小 > 0 = 路径 100% 正确。详细：[agents/05-demo.md §5.3.16 写法模板](../../agents/05-demo.md#5316-详细日志强制)。 |
| 「刚刚 step-1 的日志不完整啊。调用模型参数没全部打印出来」 | 日志要打**完整入参**才能体现教学核心可观察点 | **是缺口**：原来 `data.入参 = { messagesCount, totalTokensEstimate }` 是摘要，不是完整 messages。**修法**：chat.ts 把 `request` 拼成独立变量 `{ model, messages }`，日志 `data.入参 = { request, totalTokensEstimate }` —— 完整 messages 数组落地。日志从此可复习：每条都打完整入参 + 完整返回值 + 字段释义 + 本轮为什么是这些参数（§5.3.16 「data 建议键」）。 |
| 「看日志有没有落库直接看 logs/ 就行。不用像现在这样搞这么复杂」 | 服务起那一刻已经在写日志 = 路径 OK 唯一检查 | **核心认知**：server.ts 的 `app.listen` 回调里 `logger.info("server.start", ...)` —— 服务起那一刻（不是 curl 触发那一刻）就在写日志。**因此最简单的烟雾测试 = `cd apps && PORT=31001 npx tsx .../server.ts &` + sleep 4 + `ls -lh apps/{demo}/logs/$(date +%Y-%m-%d).log` + kill**。**不需要** curl / mtime / grep / 端口释放校验 —— 全是过度设计。详细：[agents/05-demo.md §5.3.16 烟雾测试](../../agents/05-demo.md#5316-详细日志强制)。 |

---

### Demo 子节进度（按 §2.7 / §5.3.14 动态 · 学习者主动锁定）

| 状态 | 子节 | 入口 | 端口 | 本子节教学点 |
|------|------|------|------|--------------|
| 🔄 | step-1 | `yarn app:06-01-context-vs-memory-step-1` | `50038` | 「看见 Context 累积」最小可观察：输入框 + 发送 / 清空 + 真 LLM（协议 A）；前端 messages 数组即 Context；服务端日志 `data.入参 = { request: {model, messages: [...]}, totalTokensEstimate }` + 字段释义 + 本轮为什么是这些参数；「清空对话」演示 Context 消失；演示上游失败按钮（§5.3.2 #2 类 B 5xx 教学端点） |

> step-N 是工作区（自由打磨），学习者主动说「锁定」才算这步完成（§5.3.14）；锁定那一刻才校验 §5.3.2 6 项 + `node scripts/check-demo.cjs` 过。
> **N 动态**：禁止预判；每步加什么由「学习者确认懂了吗 + 双方决定下一步」驱动。
> **当前闸门**：§5.3.2 6 项已齐（Happy / 4xx + 5xx 两类错误 / Loading / #output / #env-info / #page-intro）；check-demo 过；真 LLM 调通。**等你主动说「锁定」** + 后续双方决定 step-2 加什么（按需求清单第 2/3/4/5 条逐条落）。

---

### 过关自检

合上笔记能否用自己的话讲清：

- [ ] **Context = 本轮 messages；Memory = 跨会话持久化。**（最核心一句话）
- [ ] Context 不是单一概念，是分类（C1-C4）。Memory 也是（M1-M5）。操作是 O1-O4。
- [ ] 三类翻车：长期信息塞 Context / 短期数据塞 Memory / 把会话历史当 Memory 全量灌。
- [ ] Context / Session / History / State 的差（判断标准：跨会话 vs 本会话）。
- [ ] RAG 是给 Context 添砖，不是 Memory；区别在共享 vs 用户私人。
- [ ] Memory 是用户的，Fine-tuning 是厂商的 —— 你不能 fine-tune 第三方 API 模型记用户的事。
- [ ] **亲手验证 step-1 没 Memory**（例子 5 的 8 步实验）—— 这是教学核心可观察。
- [ ] 日志看完整 messages 在「调用函数开始：chat」那条；服务起那一刻 `server.start` 已在写。
- [ ] 烟雾测试 = cd apps + PORT=31001 + ls，不需 curl / mtime。

---

### 还没搞懂的

- **M1-M5 各变体的存储选型**（KV / 向量 / 容量策略）→ 模块 10 Memory。
- **Memory 何时由 Agent 哪一拍写**（Loop 内 / 显式工具 / 后台事件）→ 模块 07 手写 Agent。
- **C2 裁剪**（摘要 vs 滑动窗口）→ 模块 06 第 2 条（下一步）。
- **C1-C4 Token Budget** → 模块 06 第 3 条。
- **Memory 的写入冲突 / 并发 / 容量淘汰** → 模块 10 + 模块 19 可靠性。