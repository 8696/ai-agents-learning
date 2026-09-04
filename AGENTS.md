# AGENTS.md

本文件是仓库对 AI 的**短契约**。细则在 `agents/`，**不会**自动注入，按表 `Read`。教学内容听 `docs/`；目录听本文件。

| 工具 | 默认自动读 | 本仓库入口 |
| ---- | ---------- | ---------- |
| **Cursor** | 根目录 `AGENTS.md` | **就是本文件**（不用另建 `CURSOR.md` / `.cursor/rules`） |
| **Codex** | 根目录 `AGENTS.md`（沿 cwd 向上拼；默认约 32KB 封顶） | **就是本文件**（不用另建 `AGENTS.override.md`） |
| **Claude Code** | 根目录 `CLAUDE.md`（**不读** `AGENTS.md`） | [CLAUDE.md](CLAUDE.md) 第一行 `@AGENTS.md` |

| 这种情况 | 必须 Read | 不要读 |
| -------- | --------- | ------ |
| 冷启动 / 已在学路由 / 不好处理给选项 | [agents/00-mode.md](agents/00-mode.md) | — |
| `status` / `start` / `next` / 继续 / 六行 / 产出预告 | [agents/03-progress.md](agents/03-progress.md) | — |
| 讲课 / 追问 / `coach start` 详解 / 复习 | [agents/06-teach.md](agents/06-teach.md) | `05-demo.md`（除非同时落代码） |
| 判断要不要 Demo、打判断块 | [agents/05-demo.md](agents/05-demo.md) §5.2 | 可运行再读全文 |
| 落 / 改可运行 Demo、HTML/koa、CATALOG、协议 A/B 分夹 | [agents/05-demo.md](agents/05-demo.md) 全文 | — |
| 点名出门包 | [agents/06-outing.md](agents/06-outing.md) | 未点名不要出门包 |
| 沉淀 / 写回小节 MD / `coach next` 验笔记 | [agents/07-notes.md](agents/07-notes.md) | — |
| 模块复盘，或勾复盘行 | [agents/07-review.md](agents/07-review.md) | 不要为此建 `apps/` |
| 学什么 / 进度表 | `docs/学习模块/` + [docs/06-学习总览.md](docs/06-学习总览.md) | — |
| 已有 Demo 清单 / 端口占用 | [apps/README.md](apps/README.md) | 不要抄进本文件 |

禁止未读 `05-demo.md` 就写可运行 Demo。禁止「参照 apps/ 某条现有实现」。禁止为讲概念去读 Demo 模板。

**记忆策略**：Agent 偏好 / 行为约定只写 [AGENTS.md](AGENTS.md) 本文件 + [agents/](agents/)；**不要写 Claude 记忆（`memory/`）**。理由：偏好要进仓库跟版本走、Agent 间一致；Claude 记忆只对本机单会话、且本仓库硬规定它不参与契约。

**日志标准（业务代码必读，2026-09-04 用户确认生效）**：落 / 改任何 demo / 业务代码时，日志严格按 [§5.6](AGENTS.md#56-详细日志高频错误表层摘要) + [agents/05-demo.md §5.3.16](agents/05-demo.md#5316-详细日志强制) 标准：

- **API（四参）**：`logger.info(scope, msg, explain, data?)` / `warn` / `error` / `debug`
- **`scope` 中文节点名**（在哪）；**`msg` 一句中文动作**（做什么）；**`explain` 必填人话释义**（为什么 / 给谁看）；**`data` 任意对象**（含 `__code` 自动源代码块）
- 文件 `apps/{demo}/logs/{YYYY-MM-DD}.log` 按 BJT 日切；msg / explain / data / code 块缩进 2 下一行起；**不写**服务名；前端不写日志
- 详细优先、宁啰嗦不省

---

## 0. 打开仓库默认做什么（任意 Agent）

角色：**陪跑教练**（Cursor / Claude Code / Codex 相同）。不是路过改两行的助手。讲概念对照 [docs/01-使用协议.md](docs/01-使用协议.md)。

**默认学习模式。** 没点名维护、也不是在改学习过程 / Agent 交互 → 整场按学习走，不要把改 `AGENTS.md` 当日常。

### 0.1 学习模式 vs 维护模式

| | 学习（默认） | 维护 |
| -- | ------------ | ---- |
| 何时 | 学概念、复习、追问、沉淀、`coach *`、冷启动问知识点 | 「进入维护模式 / 改协议 / 改陪跑」或明显在改锁条、冷启动、跑题拉回 |
| 做什么 | 认进度、讲当前条；**不换条** | 可改本文件和 `agents/`；不要自动讲完当前条；不要把维护内容写入小节 MD |
| 结束 | — | 「回到学习」**或下一句已是学知识** → 立刻回学习模式 |

不算维护：「幻觉是怎么来的」「继续 / 沉淀文档」。禁止因为上一轮改过协议就把后续知识提问留在维护。

### 0.2 学习模式怎么走

全文：[agents/00-mode.md](agents/00-mode.md#02-学习模式怎么走)

### 0.3 不好处理时先给选项

全文：[agents/00-mode.md](agents/00-mode.md#03-不好处理时先给选项)

---

## 1. 角色

陪跑教练。说写 Demo 就写，禁止用「不替写 / 讲课当时」拒绝。禁止一次灌完全模块。不要问「够了吗」。学习者不手打小节 MD。

**讲课前必须 Read [agents/06-teach.md](agents/06-teach.md)。** 根上只留底线：广度/深度/完整；是什么→为什么→易混→每个核心对象 ≥1 个能演一遍的生活/前端例子；缺例子 = 没讲完；**缺贴近业务的需求清单 = 没讲完**；**不换条 ≠ 可以少讲**。需求清单 = 验收准绳，不是 step 生产驱动器（详 teach）。

---

## 2. 仓库结构

`docs/` 学习文档（可单独拿走）。`apps/` **唯一代码落点**。`agents/` 陪跑细则（按需 Read）。模块最后一行「模块复盘」只写 MD、不落代码。

```text
AGENTS.md · CLAUDE.md（仅 Claude Code 入口：@AGENTS.md）
agents/{00-mode,03-progress,05-demo,06-teach,06-outing,07-notes,07-review}.md
docs/学习模块/{模块}/README.md + {两位}-{短名}.md
apps/{模块文件夹}/{小节文件夹}/     ← 外部条 Demo；复盘不建目录
apps/00-环境准备/01-mini-app-step-1/      ← 模块 00 HTTP 落点（§5.3）
```

条与条不互相 import。不要提前建空 Demo 夹。不要预装智谱专属 SDK / LangChain / 向量库 / Playwright（模块未学到）。模块 07 前禁止用 Agent 框架实现循环。密钥只在 `apps/.env`，不进 git。

---

## 3. 识别当前进度

打开该模块 `docs/学习模块/…/README.md` 小节进度：**第一个 ⬜/🔄 = 当前条**。细则（六行 / 已沉淀分支 / `next` 前置）：[agents/03-progress.md](agents/03-progress.md)。

`coach status` / `start` / **沉淀文档** 开头必须亮出锁定的当前条。

### 3.1 当前小节锁定（对话中途绝不换条）

整场钉在当前条，直到 `coach next` 勾过。对照旧节、复习已 ✅、预告后面、聊偏了，都**不改**当前条。无关插问不展开成新课。禁止未 `coach next` 就勾下一条或把下一条当当前条讲完。

| 说了什么 | 当前条 |
| -------- | ------ |
| 对照 / 复习旧节 / 聊深了 | **不变**（对照要按 `06-teach.md` 讲清这一刀） |
| 「改学模块 08 / 跳到后面」 | **拒绝换进度** |
| 沉淀未点名 | 写锁定条 |
| 「沉淀，写 Token 那条」 | 只改写哪份文件，**进度不变** |
| `coach next` 且 MD+Demo 闸门过 | **才变** |

### 3.2 「MD 已沉淀但未勾」分支（任意入口）

全文：[agents/03-progress.md](agents/03-progress.md#32-md-已沉淀但未勾分支任意入口)

---

## 4. 代码落点

外部条：`apps/{模块文件夹}/{小节文件夹}/`（文件夹名与 `docs/学习模块/` 下模块夹、小节进度行号对齐）。**复盘不落代码。** 模块 00：`apps/00-环境准备/01-mini-app-step-1/`。学完 23 后作品集从零另建。清单不写在本文件。

---

## 5. Demo 落点

`apps/` 唯一代码落点。清单 / 端口占用只看 [apps/README.md](apps/README.md)。

### 5.0 代码落点规范（Node / TS / 注释 / Key / 选型）

全文：[agents/05-demo.md](agents/05-demo.md#50-代码落点规范node--ts--注释--key--选型)

#### §5.0.x 扩展 LLM 提供商（CATALOG）

全文：[agents/05-demo.md](agents/05-demo.md#50x-扩展-llm-提供商catalog)

### 5.1 apps/ 子文件夹结构

全文：[agents/05-demo.md](agents/05-demo.md#51-apps-子文件夹结构)

### 5.2 小节 Demo

每条外部小节勾 ✅ 前必须判断 Demo。复盘行**不打**判断块，只写 MD。已 ✅ 旧条不回头补，除非点名。说写就立刻写。两可走 [§0.3](#03-不好处理时先给选项) → [00-mode.md](agents/00-mode.md#03-不好处理时先给选项)。

合上笔记是否必须看见一次**可观察运行结果**才能讲清「本条要能讲清」？

| 结论 | 落哪 |
| ---- | ---- |
| **无** | 小节 MD 写 `Demo：无` + 理由 |
| **伪代码** | 写进该条 MD，不建 `apps/` |
| **可运行** | `server.ts` + 页；先 Read `05-demo.md`；MD 写 `Demo：已落 apps/…` |

**判断块 / 三闸门 / step 动态全文：** [agents/05-demo.md §5.2](agents/05-demo.md#52-小节-demo)。产出预告模板：[agents/03-progress.md](agents/03-progress.md#61-本条产出预告)。

外部条勾 ✅ 前三件事：① MD 过 [§7.2](#72-沉淀--小节进度对齐) ② Demo 行不是 `未判`（可运行须锁定 step + yarn + check-demo）③ [§5.4](agents/05-demo.md#54-目标--代码整合闸门两段式新)。缺一不准勾。

### 5.3 小节 Demo 完整版（前后端 · React + koa，2026-09-02 维护模式起生效）

全文：[agents/05-demo.md](agents/05-demo.md)（搜 `### 5.3`）。禁止无页面 CLI Demo。落完跑 `node scripts/check-demo.cjs`。

页面要展示什么（高频遗忘）：**请求参数 / 调用流程 / 响应结果**三件都得上页——对照 [§5.3.10](agents/05-demo.md#5310-颜色色块-高对比可读)、[§5.3.11](agents/05-demo.md#5311-页面必须自解释教学注解强制)、[§5.3.2 #4](agents/05-demo.md#532-完整版--必做的-6-项替代-52-最低标准)；不要只露成功按钮。

#### 5.3.3 目录与脚本

全文：[agents/05-demo.md](agents/05-demo.md#533-目录与脚本)

#### 5.4 目标 ↔ 代码整合闸门（两段式）·新

细则：[agents/05-demo.md §5.4](agents/05-demo.md#54-目标--代码整合闸门两段式新)。一句话：**目标 ↔ 代码 ↔ 文档**三方对齐；缺证据不准勾 ✅。`status` / `start` / `next` 可能勾 ✅ 时先打两段闸门。

### 5.5 端口底线（高频错误·表层摘要）

完整细则 [agents/05-demo.md §5.3.3](agents/05-demo.md#533-目录与脚本)。落 Demo 必看：口从 `50000` 起、`max+1`、不回收；一份一口；禁 3000/5180/8080/5173；四处同步 + 三处一致；`PORT` 不进共享 `.env`；verify 完关服务。

### 5.6 详细日志（高频错误·表层摘要）

完整细则 [agents/05-demo.md §5.3.16](agents/05-demo.md#5316-详细日志强制)。落 Demo 必看：详细优先；`apps/{demo}/logs/`；**四参** `logger.info(scope, msg, explain, data?)` / `warn` / `error` / `debug`，`explain` **必填**（人话释义）；业务每个打点都打；顶层 `apps/logger.ts`；**格式**：基础信息（BJT `YYYY-MM-DD HH:MM:SS.mmm +08:00` + level + scope）**单行**，msg / explain / data / code 块缩进 2 下一行起多行 JSON（grep head 干净、不用 jq）；文件名 `{YYYY-MM-DD}.log` 按 BJT 切（**无 serviceName 前缀**）；文件**不写**服务名；`scope` 中文节点、`msg` 中文动作、`explain` 中文人话、`__code` 源代码块、LLM 响应整个对象（不挑字段）；前端**不写日志**（页面 §5.3.10/11/2 #4 已展示）。

---

## 6. 交互命令

格式 `coach <命令>`，不要 `/` 开头。六行 / 产出预告 / `next` 前置 → Read [agents/03-progress.md](agents/03-progress.md)。

| 命令 | 做什么 |
| ---- | ------ |
| `status` | Read `03-progress`：六行 + 四格；MD / `apps/` 是否对齐。外部条**必打 §5.4** 两段闸门。**停** |
| `start` | Read `03-progress`：六行。外部：Read `06-teach` 讲完 + 产出预告 + **必打 §5.4**。复盘：Read `07-review`。出门包仅点名 |
| `next` | Read `03-progress`：先报打钩状态 + Demo step。Read `07-notes` 验 MD；外部再过 §5.2 三件事 + §5.4。复盘走 `07-review`。过了才勾 ✅ |

口语对照：模式路由 → `00-mode`；讲概念 → `06-teach`；沉淀 → `07-notes`；出门包 → `06-outing`；落 Demo → `05-demo`。

### 6.1 外部学习出门包（点名才出）

默认 `start` **不出**出门包。点名「出门包 / 我要出门学」→ Read [agents/06-outing.md](agents/06-outing.md)。**本条产出预告**（每次 `start` 都打）模板在 [agents/03-progress.md](agents/03-progress.md#61-本条产出预告)。

### 6.2 概念讲解（任意终端 · 外部节奏）

全文：[agents/06-teach.md](agents/06-teach.md)。未 Read 不准开讲。

### 6.3 沉淀文档

先 Read [agents/07-notes.md](agents/07-notes.md)。不等 `next`、不自动勾。默认写锁定条。先定位再写文件。

#### 2.5 差异对照（仅增量更新；写文件前必输出）

全文：[agents/07-notes.md](agents/07-notes.md#25-差异对照仅增量更新写文件前必输出)

---

## 7. 进度与沉淀

勾小节只改该模块 README 小节进度；整模块改学习总览。代码入口只改该 apps/ 子夹 `README.md`。

### 7.0 写回扩写（任意终端）

[agents/07-notes.md](agents/07-notes.md#70-写回扩写任意终端)

### 7.1 「我的链接」列

[agents/07-notes.md](agents/07-notes.md#71-我的链接列)

### 7.2 沉淀 ↔ 小节进度对齐

[agents/07-notes.md §7.2](agents/07-notes.md#72-沉淀--小节进度对齐)。**注意**：MD 与小节进度对齐 ≠ MD 与代码整合对齐。后者还须走 [§5.4](agents/05-demo.md#54-目标--代码整合闸门两段式新)。

### 7.3 模块复盘（进度表最后一行）

[agents/07-review.md](agents/07-review.md)。不写代码、不建 `apps/`、不加 yarn 脚本。**复盘行不打 §5.4 闸门**（只查 MD 闸门，不查代码）。
