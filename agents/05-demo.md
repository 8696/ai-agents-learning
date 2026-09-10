# Demo 落点细则（§5.0 / §5.1 / §5.3）

> **不会自动注入。** Cursor / Codex / Claude Code 只自动读仓库根 [AGENTS.md](../AGENTS.md)。
> **何时必须 Read 本文件：** 判 Demo / 写出 Demo 判断表；结论是可运行时再读全文（落/改 HTML/koa、扩 CATALOG、拆多场景、协议 A/B）。根 [AGENTS.md §5.2](../AGENTS.md#52-小节-demo) 只留三结论摘要；Demo 判断表与过关检查以本文件为准。

## 5. Demo 落点

`apps/` 是本仓库**唯一**的代码落点：模块 00 mini-app（HTTP）+ 每条外部小节的最小可运行 Demo。**模块复盘不写代码**（[§7.3](../AGENTS.md#73-模块复盘进度表最后一行)）。学完模块 23 后若要作品集，从零建独立项目。

**本文件只写规则与骨架**（何时建、目录长什么样、端口怎么算、HTML/koa 约束）。**不要**在这里追加「现在有哪些 Demo / 各用哪个端口」——那份清单只维护 [apps/README.md](../apps/README.md) 和 `apps/package.json`。

**模板只在本文件。** 新建或改可运行 Demo：一律对照下文 §5.3（目录、§5.3.2 六项、HTML 骨架、koa、§5.3.8～§5.3.12 拆分 / 环境 / UI / 注解 / 底线）。**禁止**再新建「只有 `index.ts`、没有页面」的 CLI Demo。禁止把 `apps/` 里任意一条现有 Demo 当成「以它为准去抄」。旧文件夹只是当时的实现，和本文件冲突时改代码或改协议，不要默默对齐旧代码。

### 5.0 代码落点规范（Node / TS / 注释 / Key / 选型）

| 类别 | 要点 |
| ---- | ---- |
| Node | **最低 22**（`engines: ">=22"`，不设上限）；`apps/.nvmrc` 推荐 22；`@types/node` ^22 |
| TS | `extends` `apps/tsconfig.base.json`；ESM + NodeNext；`strict: true`；外部数据 Zod 校验；`catch (error: unknown)`；相对导入带 `.js` |
| 注释 | 文件头职责+数据流；分段 `// ── ... ──`；关键行解释**为什么** |
| 模型 Key | 只在 `apps/.env`；各入口通过 `apps/load-root-env.ts` 读取。**动态切换**：改顶层 `LLM_PROVIDER` 切家、顶层 `LLM_MODEL` 覆盖该家默认模型；详见 [§5.0.x](#50x-扩展-llm-提供商catalog) |
| 选型 | 协议 A 用 `openai`（OpenAI Chat Completions）；协议 B 用 `@anthropic-ai/sdk`（Anthropic Messages API）；向量库（学 RAG 时）→LanceDB。**提供商与模型动态可换**——见 [docs/02-怎么用.md](../docs/02-怎么用.md) §1.2.1 + [§5.0.x](#50x-扩展-llm-提供商catalog) |
| HTML | 凡写 `.html`（`apps/` / 其它）必须在 `<head>` **原样**引入下面这段，禁止换版本、换 CDN、自编 `integrity`、改用别的 CSS 框架当默认样式： |

写 HTML 时用的 Tailwind（整段复制，不要改）：

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3/dist/index.global.js"
    integrity="sha384-2ql948lIdLcGEE0/qxNiudyTjgauA3RDJERu5xW75kFCvSl5a9odyQYCb6tEjnmB"
    crossorigin="anonymous"></script>
```

`apps/package.json` 起步依赖：`tsx` `dotenv` `zod` `openai` `typescript` `@types/node@^22`。§5.3 HTTP 另需 `koa` `@koa/router` `koa-static` `@koa/bodyparser` 及对应 `@types/*`（已在 `apps/package.json`，不要每个小节再装一份）。`@anthropic-ai/sdk` 在模块 02 协议对照时用；模块 00 mini-app 只跑协议 A。不要预装智谱专属 SDK / LangChain / 向量库 / Playwright。

#### §5.0.x 扩展 LLM 提供商（CATALOG）

`apps/llm.ts` 的 `CATALOG` 是事实上的提供商目录。新增 / 修改一家提供商，改两处即可，Demo 代码一律不动：

| 改哪里 | 改什么 |
| ------ | ------ |
| `apps/llm.ts` | `PROVIDER_IDS` 数组加新 id；`CATALOG` 加一项（`label` / `keyEnv` / `baseAEnv` / `baseBEnv` / `modelAEnv` / `modelBEnv` / `defaultBaseA` / `defaultBaseB` / `defaultModel`）。**实际 Key 不进本文件**，只写变量名 |
| `apps/.env.example` | 新增一段该家变量：`{ID}_API_KEY` / `{ID}_BASE_URL` / `{ID}_MODEL` / `{ID}_ANTHROPIC_BASE_URL` / `{ID}_ANTHROPIC_MODEL`；并在文首 `LLM_PROVIDER` 注释里更新允许取值 |

切换：

- **换家**：改顶层 `LLM_PROVIDER`（`minimax` / `zhipu` / `custom` / 你新加的 id）
- **同家换模型 id**：改顶层 `LLM_MODEL`（非空时协议 A/B 都用它）
- **同家换 Key / Base URL**：改该家分组变量（`MINIMAX_API_KEY` / `ZHIPU_BASE_URL` / ...）

Demo 只用 `getLlm()` / `getLlmOptional()`，不要再直接读 `PROVIDER_IDS` 或 `MINIMAX_*` 等具体变量；选家由 `apps/.env` 顶层 `LLM_PROVIDER` 决定。

### 5.1 apps/ 子文件夹结构

`apps/` 下**两类子文件夹**（模块复盘**不**在此处落代码）：

> **模块 00 mini-app 与其它可运行条一样走 §5.3 HTTP；不要再为它开 CLI。**

| 类型 | 位置 | 干什么 | 怎么写 |
| ---- | ---- | ------ | ------ |
| **模块 00 mini-app** | `apps/00-环境准备/01-mini-app-step-1/` | 模块 00 的代码落点（HTTP + SSE） | 与 §5.3 相同：根目录 `server.ts` + `public/index.html`；不拆成多个项目；**禁止** `src/index.ts` |
| **小节 Demo** | `apps/{模块文件夹}/{小节文件夹}/` | 每条外部小节的最小可运行 Demo | **一律 §5.3**：入口 `server.ts` + `public/` 页面。本地计算（Token 计数、Zod parse）也要有 UI，点按钮才能看见结果。多场景按 [§5.3.8](#538-http-demo-拆分多场景--多接口时强制) 拆。**禁止**只留 `index.ts`。不 import 其它小节 |

**README.md 写法**：
- 跑入口（`cd apps && yarn app:...`）
- 数据流（人手画一张图）
- 当前能做什么
- 对应学习沉淀（指向 `docs/学习模块/...`）

不要追加"模块 XX 验收"历史 checkbox（进度在学习总览 / 该模块 README）。

**没有 LEARNING.md**——代码改动就改该文件夹的 README.md。

模块笔记写在 [docs/学习模块/](../docs/学习模块/README.md) 对应**模块文件夹**：`README.md`（进度 + 验收 + 动手落点）+ 每小节一个 MD（文件名 `{两位序号}-{短名}.md`，与小节进度从上到下对齐；`README.md` 不编号）。

### 5.2 小节 Demo

**每条外部小节在学完、勾 ✅ 之前，必须判断本条要不要留下一份 Demo。** `apps/{模块}/{小节}/` 是"只验证当前这一条"的教学样例，**不**为后面条目做铺垫。

#### 何时判断（start 预告 + 说写就写）

判断结论在 `coach start` 结束就必须告诉学习者。默认你没明确说要时，沉淀后再写代码；**学习者说写就立刻写**（不等沉淀，禁止用「讲课当时」拒绝）。

| 时机 | 做什么 |
| ---- | ------ |
| `coach start` 详解结束 | 按下面标准判完，写出 [本条产出预告](./03-progress.md#61-本条产出预告)。用人话说清「要 / 不要写 Demo」。默认先不落 |
| 学习者说写 / 先落 Demo / 强制出 Demo | **立刻**按结论写满本条 Demo |
| 沉淀之后、`coach complete` 勾 ✅ 之前 | 再打 **Demo 判断表**（未打不准勾）。与 start 预告一致则写「与 start 预告一致」；改判须一句原因。该落还没落则当场做 |

| 行类型 | Demo 判断 |
| ------ | --------- |
| 外部概念条 | **必须判断**（结论三选一：无 / 伪代码 / 可运行；**不是**每条都要可运行代码） |
| 「模块复盘」行 | **不写 Demo 判断表**。结论固定为「只写 MD」，按 [§7.3](../AGENTS.md#73-模块复盘进度表最后一行) 写 `{NN}-模块复盘.md`。禁止用「跳过判断 / 只写笔记 / 补缺口」敷衍过去 |

已勾完的旧小节默认不改 Demo，除非学习者明确说要。

判断由助手做，对照「本条要能讲清」。一眼能定（纯概念 → 无）就自己判；**两可 / 不好处理**走 [00-mode.md §0.3](./00-mode.md#03-不好处理时先给选项)。学习者可改判：「这次不要 Demo」/「强制出 Demo」。

#### 判断标准

先问：合上文件后，是否必须看见一次**可观察的运行结果**（或写清可照着敲的步骤），才能讲清「本条要能讲清」？

| 结论 | 何时 | 落哪 |
| ---- | ---- | ---- |
| **无** | 纯概念（定义、来源、对照）；跑起来没有新信息 | 小节 MD 写 `Demo：无` + 一句理由 |
| **伪代码** | 机制步骤必须写清，但不值得起进程（如 Attention 数据怎么走） | 写进该条小节 MD 的机制 / 例子，**不建** `apps/` 文件夹；MD 写 `Demo：伪代码（见机制）` |
| **可运行** | 必须看见一次可观察的运行结果才能讲清「本条要能讲清」（调 API、协议字段、本地 encode / Zod parse 都算） | **一律 §5.3**（`server.ts` + 页）。哪怕逻辑只有几行、不调 LLM，也要有按钮和 `#output`。MD 写 `Demo：已落 apps/…` |

禁止为凑而建空文件夹。可运行 Demo **走 [agents/05-demo.md §5.3.2](agents/05-demo.md#532-完整版--必做的-6-项替代-52-最低标准) 六项**，禁止用「happy path + 一个行为然后关进程」敷衍过去，也**禁止**用纯终端 `index.ts` 敷衍过去。不要把外部条 Demo 做成第二份模块 00 mini-app。

#### Demo 判断表（勾进度前必须写）

**判断前必须先检查变体**（[§6.3](../agents/05-demo.md#63-讲完前的自查触发器)）：本条核心概念的所有变体/分支是否列全？→ 每个变体决定"无 / 伪代码 / 可运行"；→ 每个变体对应需求清单一条 + 每个可观察变体对应至少 1 个 step-N。漏变体 = 过关检查不会过。

```text
Demo 判断
- 小节：{该行「重点」}
- 结论：无 | 伪代码 | 可运行
- step-1 起手：一句话点明本条 step-1 只演示什么（如「调 LLM 真跑一次 happy path」/「请求/响应 shape 静态展示」/「单 tool_call 真调 LLM 闭环」）
- 锁定时机：学习者主动决定（不是自动触发；详见 §5.3.14）
- 理由：{对照「本条要能讲清」}
- 落点：— | 该条 MD 机制节 | apps/{模块文件夹}/{小节文件夹}-step-{N}/ · yarn app:{模块两位}-{小节两位}-{英文短名}-step-{N}
- N 动态：step-1 是工作区（自由打磨），学习者主动说「锁定」后才算这步完成；双方再决定下一步加什么（[§5.3.14](#5314-demo-子节拆分动态引导由浅入深新)）。**禁止预判 N 步**；禁止一次连落多步
- 与 start 预告：一致 | 改判：{一句}
```

N 动态 + 学习者锁定（[§5.3.14](#5314-demo-子节拆分动态引导由浅入深新)）：至少 1 个 step-N 被学习者主动锁定（✅）→ 可勾本条 ✅；后续 step-(N+1) 是「加深」，✅ 后可继续加，不阻塞当前条。

#### `coach complete` 过关检查（对外条目：过关检查 1→2→3）

全文与必查清单：[agents/03-progress.md `coach complete`](./03-progress.md#coach-complete-勾前必须先报)。本文件只留 Demo 相关口径：

| 过关检查 | 本文件对应 | 不过 |
| -- | -- | -- |
| **1** | [§7.2](../AGENTS.md#72-沉淀--小节进度对齐) MD 知识 | STOP，不进后面 |
| **2** | 本节 §5.2：Demo 行不是「还没判断要不要写」；可运行须锁定 step + yarn + `check-demo`（含行数上限 / 一路由一文件）+ [§5.3.2](#532-完整版--必做的-6-项替代-52-最低标准) 六项齐 + 端口三处一致 + [§5.3.8](#538-http-demo-拆分多场景--多接口时强制) 交互跟笔记走 / 对照拆请求 / 主流程单独成文件 | STOP |
| **3** | [§5.4](#54-目标--代码整合过关检查先抽清单再逐项核对新).A+.B 独立 subagent：抽清单 + 逐项核对 | STOP；补代码或拆成两条进度 |

「锁定 + §5.3.2 + check-demo」= **过关检查 2**；目标↔代码 = **过关检查 3**。复盘行不写过关检查 2/3（[§7.3](../AGENTS.md#73-模块复盘进度表最后一行)）。

#### 可运行 Demo 怎么建

不要提前建空的小节文件夹。`apps/` 共享 package（`package.json` · `load-root-env.ts` 等）**已经存在**，不要再问「可不可以建 apps/」。只需按条建该小节文件夹。已有哪些 Demo → [apps/README.md](../apps/README.md)（清单，不是模板）。写法对照本节 + §5.3，不要去抄某一条现有 Demo。

```text
apps/{模块文件夹}/{小节文件夹}/
  可运行（§5.3，含不调 LLM 的本地计算）  README.md · server.ts（只装配）· routes/health.ts · lib/http/ · public/
                                          多场景再加分层 lib/ + public/pages|components|utils（[§5.3.8](#538-http-demo-拆分多场景--多接口时强制)）
模块 00 mini-app    HTTP：根目录 server.ts + public/（§5.3；多场景走 §5.3.8）。禁止 src/index.ts。
```

- **一个** `apps/package.json`（不要每个小节一个），`cd apps && yarn install` 一次。
- **跑入口必须是 yarn 脚本，名字要能看懂是哪一条。** 新建可运行 Demo 时，同步在 `scripts` 加一条，禁止只留 `yarn tsx 长路径` 当主入口：
  - 名字：`app:{模块两位}-{小节两位}-{英文短名}-step-{N}`（kebab-case）。`{模块两位}` = 进度表模块编号（`00` `01` …）；`{小节两位}` = 该模块小节进度内的行号（`01` `02` …）；`{英文短名}` 对照该条小节、一眼能认；`{N}` = 子节序号（`1` 起步，动态追加）。禁止用 `dev` / `start` / `app` 这种会撞车的名字。模块 00 mini-app 也走这套：`app:00-01-mini-app-step-1`（`{英文短名}` = `mini-app`，无例外）。
  - 命令：`tsx {模块文件夹}/{小节文件夹}-step-{N}/server.ts`。禁止为小节 Demo 写 `tsx …/index.ts` 当主入口。
  - 该条 Demo 的 README、`apps/README.md` 表格只写 `cd apps && yarn {script}`。
  - 可运行但 `package.json` 里没有对应 `app:{MM}-{SS}-{name}-step-N` → **不准勾**（与下面过关检查相同）。
- 共用：`typecheck`（`tsc --noEmit`）。
- Key 只读 `apps/.env`：`load-root-env.ts` 从 `apps/load-root-env.ts` 读取 `apps/.env`。Demo 里不要再放 `.env`。
- 技术栈与 [§5.0](#50-代码落点规范node--ts--注释--key--选型) 相同：TS 5 + Node ≥22 + yarn；`tsconfig` `extends` `./tsconfig.base.json`；相对导入带 `.js`；`catch (error: unknown)`。写 `.html` 时 Tailwind 脚本必须用 §5.0 **HTML** 那一段（含 `integrity`），不要换。
- 起步依赖：见 [§5.0](#50-代码落点规范node--ts--注释--key--选型)。本条需要协议 B 再加 `@anthropic-ai/sdk`。不要预装智谱专属 SDK / LangChain / 向量库 / Playwright（模块未学到）。
- **无** `LEARNING.md`。概念 / 易混 / 例子只在该条小节 MD。
- 该小节文件夹不 import 其它小节、不 import 模块 00 mini-app。

### 5.3 小节 Demo 完整版（前后端 · React + koa，2026-09-02 维护模式起生效）

`§5.2`「最小可运行」对外部小节不充分：起进程看一次响应就关掉，看不到错误态、看不到对照。**2026-09-03 起：凡结论是「可运行」的外部小节一律按 §5.3 全栈版写**（调 API 与纯本地计算都要有页面）。禁止用「happy path + 一个行为」敷衍过去，禁止只留终端 `index.ts`。

#### 5.3.0 Demo 默认调大模型（硬规则，2026-09-08 起）

落 Demo **默认情况下必须真调用大模型**。**禁止**用本地 mock / 固定返回值 / hard-coded JSON 冒充模型响应（包括「1 个函数返回假数据 + 1 个按钮 + 1 个 #output」这类最小闭环起手）。

**Why**：本仓库核心是学 LLM 应用；调不到真模型的 Demo = 没教学价值。Mock 出来的「成功」和真模型的「成功」不是同一回事——响应延迟、token 流、错误态、模型行为差异都不在 mock 里。学完只跑过 mock 等于没碰 LLM。

**例外（这两种仍可不调 LLM，照常写日志 + 过 check-demo）**：

- **本地计算**：Token encode / Zod parse / 余弦 / 玩具向量表 / 任何不调 LLM 的纯函数（§5.0.x、§5.3 / §647 已有专门路径）
- **纯协议形状 / UI 渲染层演示**：tool_call 请求 / 响应 JSON 形状演示、纯前端 UI 渲染层（调 LLM 也看不到形状差；这种情况用静态 JSON 当作「形状样例」≠ 充当「模型响应」，且 §5.2 Demo 判断表要写明是「形状演示」）

**生效范围**：本规则对**此后新落 / 新改**的 Demo / step 强制。已锁定旧 Demo **已勾完的旧条默认不改**（除非你明确说要），与 §5.6 日志一致。

#### 5.3.1 适用范围

| Demo 类型 | 走哪 |
| --------- | ---- |
| **可运行外部条**（调 API、流式、对照、以及 Token encode / Zod parse 这类本地计算） | **§5.3**（本节，前后端；必须有 HTML） |
| **模块 00 mini-app** | 与上相同：`server.ts` + `public/`；**禁止** CLI |

#### 5.3.2 完整版 = 必做的 6 项（替代 §5.2 最低标准）

| # | 项 | 含义 |
| - | -- | ---- |
| 1 | **Happy path** | 本条主要用例完整跑通（对照、并排、多端点等按该条需求，不要只打一次就关进程）。**笔记写了几步交互就几步**（[§5.3.8](#538-http-demo-拆分多场景--多接口时强制)），禁止压成一个按钮 |
| 2 | **错误处理**（≥2 类，能一眼分开） | **一类**：页面能看见的失败（HTTP 4xx / 5xx，或 fetch reject，或本条教学点里的失败：取消 / 429 / Zod 校验）。**另一类**：与第一类不同的失败通道。`catch` 后必须有面向人的红字 + `#status-pill` 变红。**不要**每页都强制「故意断网」按钮；本条教学点不是网络时，用空输入 400、取消、或业务失败即可。 |
| 3 | **Loading 状态** | 请求中 `#status-pill` = 🔄请求中 + 按钮 `disabled`；完成/失败切回 ✅/❌ |
| 4 | **单会话输出区** | `#output` 显示完整对话 / 对照结果；新结果追加或覆盖，按小节定（[AGENTS.md §5.3 高频遗忘](../AGENTS.md#53-小节-Demo-完整版前后端--react--koa2026-09-02-维护模式起生效)：**请求参数 / 流程 / 响应结果**三件上页，不只露成功按钮） |
| 5 | **环境元信息** | `GET /health` + 页脚 `#env-info` 显示 provider / model / port / 有没有 Key（[§5.3.9](#539-环境元信息health--页脚强制)） |
| 6 | **页面自解释** | `#page-intro` 讲清本页演示什么 + 数据流步骤；控件旁写「点了会发生什么」（[§5.3.11](#5311-页面必须自解释教学注解强制)） |

缺任何一项 = 不算 §5.3 完整版。

#### 5.3.3 目录与脚本

**每条 HTTP Demo 都要有装配层 + health**（1 个页面也不例外；禁止把业务 `router.get/post` 写进 `server.ts`）：

```
apps/{模块文件夹}/{小节文件夹}/
├── server.ts              ← 只做装配：PORT、bodyParser、mountXxx(router)、serve、listen
├── lib/http/runtime-ctx.ts ← `.default(5MMSS)`；/health 与 listen 读同一个 PORT
├── routes/health.ts       ← GET /health（§5.3.9）；业务端点另开 routes/*.ts
├── README.md              ← 含「端口」一行（与 runtime-ctx、apps/README 占用表同一数字）
└── public/
    └── index.html         ← 固定骨架（§5.3.4）；浏览器默认入口 GET /
```

**多场景再加**（≥2 个彼此独立的页面场景，或 ≥3 个业务端点 → **必须**按 [§5.3.8](#538-http-demo-拆分多场景--多接口时强制)）：

```
├── lib/                   ← 按职责分子目录（不是一堆平铺文件）
│   ├── http/              ← runtime / 错误透传 / 入参校验
│   ├── tools/             ← 例：Registry、Tool 定义
│   ├── schema/            ← 例：Zod → JSON Schema
│   └── flow/              ← 本步核心流程单独成文件（Agent 循环 / 调模型 / 规划器）；旁边小帮手可同文件或同目录相邻
├── routes/                ← health + **一个业务 URL 一个文件**（对照两侧 = 两个文件；先规划 / 再确认 = 两个文件）
└── public/
    ├── index.html         ← 总览 / 导航（链到 pages/）
    ├── pages/             ← 独立场景各一页
    ├── components/        ← 共享 JSX，挂 window.DemoUI
    └── utils/             ← 共享无 JSX，挂 window.DemoUtils
```

yarn 脚本仍只指向 `server.ts`；禁止为每个场景再开一个入口或端口。子目录名按本条职责语义取，上表是常见切法，不是强制同名。

- **依赖**：
  - runtime：`koa` `@koa/router` `koa-static` `@koa/bodyparser` `openai`（要协议 B 加 `@anthropic-ai/sdk`） `zod` `dotenv`
  - dev：`tsx` `typescript` `@types/node@^22` `@types/koa` `@types/koa-static` `@types/koa__router`
  - **不引**：`@types/react` / `@types/react-dom` / `esbuild` / 任何打包器（Babel Standalone 在浏览器跑，HTML 内联 JSX 不走 TS）
- **端口（强制：全仓库默认口不得重复）**：

  ### 公式

  ```text
  候选 PORT = max(占用表所有端口) + 1
  起步：模块 00 mini-app · 第一条 HTTP Demo = 50000
  删 demo 不回收口（避免历史 git tag / curl 收藏的链接挂掉），后续新建继续 max + 1
  ```
  不用旧公式 `5{模块}{小节}` / `+10`：端口与模块/小节位置**解耦**，换「不会撞 / 不会溢出 / 不用错位」。一眼看不出属于哪条是可接受的代价。

  ### 新建 / 改口 checklist（5 步必走）

  1. 打开 [apps/README.md](../apps/README.md)「默认端口」列，找最大端口 **M**。
  2. 新 demo 的端口 = **M + 1**。**一份 demo 一个口**；step-N 与 step-1 是兄弟，各占一个口（例：`05-01-fc-protocol-step-1` = 50017、`05-01-fc-protocol-step-2` = 50018）。
  3. 同步四份到同一个五位数 **M+1**：
     - `apps/{模块文件夹}/{小节文件夹}-step-{N}/lib/http/runtime-ctx.ts` → `.default(M+1)`
     - `apps/{模块文件夹}/{小节文件夹}-step-{N}/public/components/layout.js` → 页脚 fallback `env.port || M+1`（及文件顶部 docstring 里若提到「默认口」）
     - `apps/{模块文件夹}/{小节文件夹}-step-{N}/README.md` → 「端口」行 + 所有 `http://127.0.0.1:NNNNN/` URL
     - [apps/README.md](../apps/README.md) 占用表 → append 新行
  4. 跑 `node scripts/check-demo.cjs`：检查项包括「三处一致」「默认口全仓库不重复」「layout.js fallback 与本条一致」。
  5. 改口 / 删 demo 同理同步这四份。

  ### 其它约束

  `lib/http/runtime-ctx.ts` 把该数字写成 `z.coerce.number().default(...)`（不要写在 `server.ts` 里再 parse 一次）；启动必须打印 `http://127.0.0.1:{PORT}/`。
  可用环境变量 `PORT=` **单次**覆盖（只影响这一次进程）。**禁止**把 `PORT` 写进共享的 `apps/.env`（否则所有 Demo 被拧成同一个口）。

**新约束（2026-09-08 起）**：每个 demo 的 `apps/package.json` script 命令必须 **inline `PORT=<该demo默认端口>`**，例如 `"app:05-02-description-step-1": "PORT=50025 tsx 05-Tool-Calling/02-Tool-Description-step-1/server.ts"`。

| 责任 | 在哪 |
| ---- | ---- |
| **主端口源**（新建 / 改 demo 时改这里） | `apps/package.json` script 命令 inline `PORT=<N>` |
| **占用表**（默认端口列） | `apps/README.md` 表格 |
| **页脚 fallback / README 端口行** | demo 自己的 `public/components/layout.js`、`README.md` |
| **兜底**（仅在 script 没 inline 且 `process.env.PORT` 也空时才用） | `lib/http/runtime-ctx.ts` 的 `z.coerce.number().default(<N>)` |

理由：端口从 50000 起顺序分配 + 多 demo 并行跑，单看 `runtime-ctx.ts` 看不出「这条 demo 默认几号」。把端口 inline 进 yarn script = 跑这条 demo 时一眼看到 `PORT=50025`。`.default()` 仍保留（兜底），但不再是主要指定方式；学习者跑 `PORT=其他 yarn app:...` 单次覆盖也仍生效。

**新建 demo 端口分配流程**（2026-09-08 起，端口的唯一权威源 = `apps/package.json`）：

1. **解析** `apps/package.json`：grep 所有 `"app:.*PORT=<N> tsx` 的最后一条，拿到 N = 当前最大端口
   - 不要查 `apps/README.md` 占用表（占用表是镜像，不是源；模块/小节号也不参与计算）
   - 不要按 §5.3.14 的「5{模块}{小节+10×(N-1)}」公式（撞车备用，仅在显式撞车时 +10 继续）
2. **新 demo 端口 = N+1**（例：当前最后一条是 `PORT=50025` → 新 demo = `PORT=50026`）
3. **同步 4 份**到同一个 N+1：
   - `apps/package.json` script 命令 inline `PORT=<N+1>`（**主端口源**）
   - `apps/{demo}/lib/http/runtime-ctx.ts` `.default(<N+1>)`（兜底）
   - `apps/{demo}/public/components/layout.js` 页脚 fallback + `apps/{demo}/README.md` 端口行
   - `apps/README.md` 占用表 append 新行（默认端口列 = N+1）
4. **验证**：`cd apps && node ../scripts/check-demo.cjs` 必须「默认端口全仓库不重复」+「yarn app:* 没有 CLI 入口」全过

  **禁止**：3000 / 5180 / 8080 / 5173 这类随手写的口；一份 Demo 为每个场景页再 listen 一个口（多页共用一个进程、一个口）；页脚 fallback 抄别条的数字。
- **`package.json` script**：名字 `app:{模块两位}-{小节两位}-{英文短名}-step-{N}`；命令 `tsx {模块文件夹}/{小节文件夹}-step-{N}/server.ts`（在 `apps/` 下跑）。**不再单独入口层**（不要再写一个只转发的 `index.ts`）。
- **不引**：express / fastify / sirv / 任何非 koa web 框架；htm / preact / 任何 React 替代品；vite / webpack / parcel / esbuild / 任何打包器。
- **README**：§5.1 四项保留，新增「端口 + 浏览器访问地址」一行。

#### 5.3.4 HTML 固定骨架（强制）

每个 `public/*.html` 页面（含 `index.html` 与按 §5.3.8 拆出的场景页）**必须**按下述结构写，禁止替换。这就是 HTTP Demo 的 HTML 模板（不要改去对齐某条现有 `apps/.../public/*.html`）。多场景时每页各自复制这份骨架，用页内导航跳转，**不要**把无关场景堆进同一个 HTML 用 tab / 按钮充数。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{小节名}</title>

  <!-- §5.0 强制：Tailwind 4 browser CDN 原样引入（禁止换 CDN / 版本 / integrity） -->
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3/dist/index.global.js"
      integrity="sha384-2ql948lIdLcGEE0/qxNiudyTjgauA3RDJERu5xW75kFCvSl5a9odyQYCb6tEjnmB"
      crossorigin="anonymous"></script>

  <!-- §5.3.4 强制：React 18.3.1 UMD CDN（普通 script，不用 module 也不用 importmap）。
       注：React 19 移除了 UMD bundle 只发 ESM；§5.3.4 用 React 18 UMD。 -->
  <script crossorigin src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>

  <!-- §5.3.4 强制：Babel Standalone **锁定 7.26.4**。
       8.x 默认 preset-react 是 automatic runtime（输出 import { jsx } from "react/jsx-runtime"），
       与本规则"完全 ESM 禁用"冲突。7.26.4 默认是 classic runtime（输出 React.createElement）。
       不要在 script type="text/babel" 块上加 data-presets / data-plugins——Babel 默认行为即可。 -->
  <script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"></script>

  <!-- §5.3.4 强制：**JSX 块内不允许 TypeScript 语法**（2026-09-08 沉淀 · step-2 白屏事故）
       Babel Standalone 默认只编译 JSX → JS，**不解析 TS 类型注解**。
       浏览器运行时遇到 TS 泛型 / 类型注解 → ReferenceError（如 "number is not defined"）。
       禁止：useRef<number>(null) · interface Foo {} · type Bar = ... · const x: string = ...
       允许：纯 JS · 运行时类型用 propTypes / 注释 · type 断言全删。 -->

  <!-- 自定义 CSS 仅当 public/app.css 真实存在时才加这一行；禁止用它替换 Tailwind -->
</head>
<body class="bg-gray-50 text-gray-900 font-sans">
  <div id="root"></div>

  <!-- type="text/babel"：告知 Babel Standalone 在运行时转译此脚本块，
       将 JSX 语法（如 <App />）转换为 React.createElement() 调用。
       页面自己的 React（含 JSX）写在本页内联块里，**不**另起 app.tsx。
       多页共享的 JSX 放 public/components/，无 JSX 放 public/utils/（§5.3.8）。 -->
  <script type="text/babel">
    // ── 解构 React 全局变量（UMD CDN 加载后 window.React / window.ReactDOM 存在） ──
    const { useState, useEffect } = React;

    // ── 主组件：按 §5.3.4 强制骨架渲染 id ──
    function App() {
      return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
          <header
            id="page-header"
            className="border-b p-4 flex items-center justify-between bg-white"
          >
            <h1 id="page-title" className="text-xl font-semibold">
              {小节名}
            </h1>
            <span
              id="status-pill"
              className="text-xs px-2 py-1 rounded bg-gray-200"
            >
              ⏸ 待连接
            </span>
          </header>

          <main id="page-main" className="container mx-auto p-4 space-y-4">
            <section
              id="page-intro"
              className="bg-white shadow rounded p-4 space-y-2"
            >
              {/* §5.3.11：本页演示什么 + 数据流步骤（给读者，不是给自己留言） */}
              <p className="text-sm text-gray-700">本页只演示：{一句话教学点}</p>
              <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
                <li>{步骤 1：点了按钮会发出什么请求}</li>
                <li>{步骤 2：服务端做了什么}</li>
                <li>{步骤 3：结果怎么回到下面输出区}</li>
              </ol>
            </section>
            <section
              id="controls"
              className="bg-white shadow rounded p-4"
            >
              {/* 该小节交互区：按 demo 业务填充；每个控件旁一句「点了会发生什么」 */}
              <div className="text-sm text-gray-500">{小节名} Demo</div>
            </section>
            <section
              id="output"
              className="bg-white shadow rounded p-4 min-h-[200px]"
            >
              {/* 该小节输出区；空态也要有文案，见 §5.3.10 */}
            </section>
          </main>

          <footer
            id="page-footer"
            className="border-t p-2 text-xs text-gray-500 text-center"
          >
            {/* §5.3.9：环境元信息来自 GET /health，禁止写死模型名 */}
            <span id="env-info">
              端口 {本条 5MMSS} · 协议 A · provider {env.provider} · model {env.model} · Key {env.hasKey ? "✅" : "❌"}
            </span>
          </footer>
        </div>
      );
    }

    // ── 入口：UMD 全局 ReactDOM.createRoot（React 18 API） ──
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(<App />);
  </script>
</body>
</html>
```

**强制命名约定**（id 全小写连字符，**由 React 组件渲染出来**）：
- `#page-header`（含 `#page-title` + `#status-pill`；**只放**页名和状态，环境信息不放这里）
- `#page-main`（含 `#page-intro` + `#controls` + `#output` 三个 section）
- `#page-footer`（含 `#env-info`：端口写本条 §5.3.3 算出的默认 PORT，禁止抄死数字、禁止抄别条；provider / model 由 `GET /health` 填，**禁止写死** `MiniMax-M3` 之类。见 [§5.3.9](#539-环境元信息health--页脚强制)）

**`#status-pill` 四态**：`⏸待连接` / `🔄请求中` / `✅完成` / `❌错误`（由 React 组件根据请求状态切换 className / textContent）。

**禁止**：
- 替换 §5.0 的 Tailwind 脚本（CDN / 版本 / integrity）
- 替换 §5.3.4 的 React UMD / Babel Standalone CDN（URL / 版本 / UMD 路径）
- Babel 升级到 8.x（会触发 automatic runtime 注入 import）
- 在 `<script type="text/babel">` 块上加 `data-presets` / `data-plugins`（默认 classic runtime 即可；显式加 attribute 反而会踩坑）
- 用 `<script type="module">` / importmap / `import` 语法（**完全 ESM 禁用**）
- 在 HTML 里加第三方包（htm / preact / React 替代品均不允许）
- 用 `<div>` 全替 `<header>` / `<main>` / `<footer>`（JSX 里就是 `<header>` / `<main>` / `<footer>` 标签）
- 改 id 命名（保持可被 grep 检索）
- 页脚写死模型名（`MiniMax-M3` 等）；模型跟 `apps/.env` 的 `LLM_PROVIDER` / `LLM_MODEL`，跟 `apps/llm.ts`
- 省掉 `#page-intro`（§5.3.11 必须）或 `#env-info`（§5.3.9 必须）

**`<script>` 加载顺序**（严格按此序；React 未定义会全炸）：
1. Tailwind 4 browser CDN（含 integrity）
2. React 18.3.1 UMD
3. ReactDOM 18.3.1 UMD
4. Babel Standalone 7.26.4
5. （多页时）`public/utils/*.js`：无 JSX，**普通** `<script src>`（禁止 `type="module"`）
6. （多页时）`public/components/*.js`：共享 JSX，各用 `<script type="text/babel" src="…">`，必须在本页内联块**之前**；组件挂 `window.DemoUI`
7. `<script type="text/babel">` 本页内联 JSX 块（**必须最后**）

**`<` 写在哪：JSX 文本节点 vs JS 字符串（实测踩坑）**

- **JSX 文本节点**（`>...<` 之间）：`<think>` 会被当成新标签，整页白屏。包成表达式：`{"<think>"}`。
  ```jsx
  // 错：❌ Expected corresponding JSX closing tag for <think>
  <span>无 <think> 块</span>
  // 对：✅ 仅 JSX 子节点用这种写法
  <span>无 {"<think>"} 块</span>
  ```
- **JS 字符串 / 模板字符串 / `INTRO_STEPS` 数组**：**禁止**往里面塞 `{"<think>"}`。双引号会在 `{` 后面的 `"` 处被截断，剩下的 `<think>` 仍当 JSX，整页转译失败（`stream.html` 踩过）。模板字符串里则会把 `{"<think>"}` **原样显示**给读者。
  ```js
  // 错：❌ 写在双引号字符串里
  "独立字段还是嵌 {"<think>"}"
  // 对：✅ 口语，或拆开拼接
  "独立字段还是嵌 think 标记"
  "<" + "think>"
  ```
- JSX attribute、普通字符串字面量里的单个 `<`（不是 `{"<tag>"}` 这种夹心）一般不触发。注释里写 `{"<think>"}` 也不当 JSX，但读者看不见，别当页面说明用。

#### 5.3.5 后端（koa + @koa/router + koa-static）

`server.ts` **只做装配**，禁止在这里写 `router.get` / `router.post`。业务（含 SSE）一律 `mountXxx(router)`，写在 `routes/`。

```ts
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { mountHealthRoutes } from "./routes/health.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());          // 必须在 router 前
mountHealthRoutes(router);      // 至少 /health；业务再 mount 别的 routes/*
app.use(router.routes()).use(router.allowedMethods());  // 必须在 serve 前

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));      // 必须绝对路径

app.listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}/`));
```

业务 handler 写在 `routes/*.ts`（薄：入参校验 → flow → `ctx.body`）。SSE 同样在 route 里（见下面「SSE 端点」）。

**强制**：
- **`server.ts` 禁止** `router.get` / `router.post`；至少 `routes/health.ts` + `lib/http/runtime-ctx.ts`
- **不引**：express / fastify / hapi / polka / 任何非 koa 的 web 框架
- **不引**：htm / preact / 任何 React 替代品
- **不引**：vite / webpack / parcel / **esbuild / 任何 JSX transform / 任何打包器**（Babel Standalone 在浏览器跑）
- **不引**：`@types/react` / `@types/react-dom`（React 代码写在 HTML 内联 `<script type="text/babel">` 块，不走 TS）
- koa-bodyparser / `@koa/bodyparser` 二选一；**显式声明**，禁止隐式默认
- 页面 React **默认**只放在该 HTML 内联 `<script type="text/babel">` 块（不上 app.tsx / src/）。多页共享的 JSX 放 `public/components/`，无 JSX 放 `public/utils/`（[§5.3.8](#538-http-demo-拆分多场景--多接口时强制)）；禁止 ESM `import`、禁止打包器
- **`serve` 第一个参数必须绝对路径**（不能用 `"./public"` / `"public"` 相对路径，**实测踩坑**——相对路径是相对 process.cwd()，启动目录不固定时 GET / 会 404）
  ```ts
  // 错：❌ 启动目录在 apps/ 时解析为 apps/public（不存在）
  app.use(serve("./public"));
  // 对：✅ 永远相对 server.ts 所在文件夹
  const publicDir = fileURLToPath(new URL("./public", import.meta.url));
  app.use(serve(publicDir));
  ```
- **中间件顺序**（实测踩坑）：bodyParser **必须**在 router 之前；router **必须**在 serve 之前（否则 router 匹配前 serve 已处理 404）
  ```ts
  app.use(bodyParser());
  app.use(router.routes()).use(router.allowedMethods());
  app.use(serve(publicDir));
  ```
- **ctx 类型显式 `Context` / `Next`**（绕开 @koa/router v13 + @types/koa__router v12 的 `Request` 类型不一致；**实测踩坑**）
  ```ts
  import type { Context, Next } from "koa";
  router.get("/api/...", (ctx: Context, _next: Next) => { ... });
  ```
- **SSE 端点**必须 `ctx.respond = false`，handler 直接用 `ctx.res.write` / `ctx.res.end` 绕过 koa 响应抽象；`ctx.request.body` 已由 bodyParser 解析
  ```ts
  router.post("/api/stream", async (ctx: Context) => {
    ctx.respond = false;
    ctx.res.writeHead(200, { "Content-Type": "text/event-stream", /* ... */ });
    // ... 业务
    ctx.res.write(`data: ${JSON.stringify(...)}\n\n`);
    ctx.res.end();
  });
  ```

**CORS**：开发期同源（`http://127.0.0.1:{port}` ↔ `{port}`）够用；跨域时显式声明，**不**做 `*`。

#### 5.3.6 React 组件规范（HTML 内联 `<script type="text/babel">` 块）

- **位置**：该页自己的 JSX 写在本 HTML 内联 `<script type="text/babel">` 块。无 app.tsx / src/。多页复用：JSX → `public/components/`，无 JSX → `public/utils/`（见 §5.3.8），挂 `window.DemoUI` / `window.DemoUtils`。
- **运行时变量**：浏览器里 `React` / `ReactDOM` 是 UMD 全局变量；**不** import。
- **状态**：组件内 `React.useState` / `React.useEffect` / `React.useRef`（显式调用 React 前缀；或解构全局 `const { useState } = React;`）；**禁止** Redux / Zustand / Recoil / 任何状态库。
- **副作用**：直接 `fetch(...)`；**禁止** React Query / SWR / axios。
- **样式**：Tailwind className 写在 JSX 上；自定义 CSS（要的话）写到 `public/app.css`。
- **JSX**：直接写 JSX；不要加 `data-presets` / `data-plugins`（§5.3.4：Babel 7.26.4 默认 classic runtime 即可）。
- **入口**：内联块末尾写（与 §5.3.4 骨架一致）
  ```js
  const root = ReactDOM.createRoot(document.getElementById("root"));
  root.render(<App />);
  ```
- **类型**：HTML 内联 JS 不走 TS；无类型检查。状态/事件处理写注释解释意图。

#### 5.3.7 已落地清单不写在本文件

新建 / 改端口 / 加 yarn 脚本时：同步 [apps/README.md](../apps/README.md) 表格 + `apps/package.json`。**不要**把条目抄回本节。**不要**写「参照某某 Demo」。

落完或改完可运行 Demo：先 `cd apps && yarn install`，再跑 `node scripts/check-demo.cjs`（无参扫全部 HTTP Demo；也可传一条文件夹；`cd apps && yarn check-demo` 等价）。不过关不准当「按模板写完」。JSX 语法检查用 `apps` 的 `@babel/parser`，不要往仓库塞 Babel Standalone。

模块 00 mini-app 与其它条一样走根目录 `server.ts` + §5.3 HTML，端口按 §5.3.3 顺序分配（首个 50000）。已 ✅ 的旧 HTTP Demo **默认不回头改结构**，除非学习者明确说要。

#### 5.3.8 HTTP Demo 拆分（多场景 / 多接口时强制）

2026-09-03 维护模式起生效。

**问题**：多个独立场景的接口和 UI 全塞进一个 `server.ts` + 一个 `index.html`，文件过大，人和 Agent 都不好改。只「拆成很多文件」不够——平铺的 `lib/*.ts`、一个巨型 `ui.js` 仍然难读。

**入口仍然只有一个**：yarn 脚本 → `tsx …/server.ts`；浏览器默认 `http://127.0.0.1:{PORT}/`。禁止每个场景一个进程、一个端口、一条 yarn 脚本。条与条仍不互相 import。

| 何时 | 怎么做 |
| ---- | ------ |
| **每条 HTTP Demo**（含 1 个页面） | `server.ts` 只装配；至少 `routes/health.ts` + `lib/http/runtime-ctx.ts` |
| **本步核心流程**（Agent 循环 / 调大模型 / 规划器等） | **必须单独成文件**，见下方「落代码前先点名本步核心」 |
| **每个独立功能场景**（另一个教学点，不是对照的另一侧） | **必须再拆页**（`public/pages/{场景}.html` + `routes/{场景}.ts`） |
| **Registry / 执行器 / 错误处理要复用** | 抽到 `lib/tools/`、`lib/flow/`、`lib/http/` 分层；不重复实现 |

**一个业务 URL 一个文件（2026-09-10 收紧）**：每个 `routes/*.ts`（不含 `health.ts` / `error-demo.ts`）默认只挂 **一条业务路径族**。`check-demo` 会拦。

| 可以同文件 | 必须拆成两个文件 |
| -- | -- |
| 同一路径的 GET / POST / DELETE（同一资源） | 对照的两侧（`/api/step-by-step` 与 `/api/plan-and-execute`） |
| `/api/agent-run` + `/api/agent-run/:runId`（同一资源的发起 / 查询） | 先规划 / 再确认（`/api/plan` 与 `/api/confirm-plan`） |
| 同一 URL 用 query/body 区分短任务 / 长任务 | `/api/tools` 列表 与 `/api/chat` 对话（新 Demo 拆开；旧文件豁免） |

**对照可以同页（2026-09-10 说清）**：对照的教学点就是「并排看见差异」，**允许左右两栏放在同一个 HTML**。不是「必须拆成两个页面」。禁止的是：一个超级接口打包跑两侧；把两侧卡片的 JSX 全堆进 `index.html` 内联块。正确：每侧自己的请求 + 左栏 / 右栏 / 对照数字各自组件。

**无关功能才拆页**：学生切页面 = 换教学点；切按钮 = 同一教学点里的动作（跑左栏 / 跑右栏 / 同时对照）。禁止用 tab 把另一个变体堆进这一页。

##### 落代码前先点名本步核心（主流程单独成文件 · 2026-09-10 立）

本仓库是学**大模型**和 **Agent** 的。文件拆开是为了让学习者打开就能顺着主路径看懂，不是为了目录好看。

落 / 改 Demo **第一件事**：Agent 自己判断并写进核心文件头 —— **本步核心：……**（一句人话）。常见就这几类，按本步教学点选 **1 个**（偶尔 2 个，例如「规划」和「按清单执行」）：

| 本步核心大概是 | 单独成哪个文件（名字按语义取） |
| -- | -- |
| Agent 循环（while：想 → 做 → 看） | `lib/flow/loop.ts` |
| 调大模型这一跳（含流式 / 带 tools） | `lib/flow/` 里一眼能认的调用文件，不要写在 route 里 |
| 规划器一次吐清单 | `lib/flow/plan.ts` 或 `parse-plan.ts` |
| 按清单执行 / 重规划 | `lib/flow/plan-and-execute.ts` / `execute-plan.ts` / `replan.ts` |
| 压缩、摘要、Token 预算裁剪 | `lib/flow/` 或本条对应职责目录里的主函数文件 |

**硬性**：route 只做「校验入参 → 调核心文件 → 写 `ctx.body`」。禁止把 `while`、规划器、`openai.chat.completions.create` 埋进 `routes/*.ts`。学习者复习时应能：**先打开核心那一个文件，把主路径读完**，再按需看工具 / 校验 / 页面。

**不要拆太细**（和「必须有核心文件」一起读）：

| 拆 | 不拆 |
| -- | -- |
| 核心流程 vs HTTP 入参 vs 工具 handler | 核心里相邻的小步骤（剥 think 块、parseArgs、拼 messages）——同文件或同目录相邻文件即可 |
| 对照两侧的两个 URL | 一函数一文件、五个各 8 行的空壳 |
| 页上两块能单独讲清的 UI（轨迹卡 vs 计划卡） | 为凑「有 components 目录」而做的只有一行 JSX 的假组件 |

判据：改核心时不该被迫同时打开 8 个文件；但打开核心文件时，主路径必须连续可读。

##### 前端：一功能一页；对照同页；一律拆组件

| 情况 | 页 | 组件 |
| -- | -- | -- |
| 一个独立功能 / 一个教学点 | 一页（`index.html` 或 `pages/{场景}.html`） | 页上每个能单独讲清的可视块各自 `public/components/` 文件 |
| 对照同一教学点的两侧 | **可以同页并排** | 左栏、右栏、对照数字、计划卡、轨迹卡分开；内联块只装配（按钮 + fetch + 把数据交给组件） |
| 两个无关教学点 | 拆两页 | 各页自己的组件 |

即使只有一页、没有对照：也不要把轨迹 / 副作用三栏 / 失败卡全写进 `index.html` 内联块。内联块是装配层，类似 `server.ts`。页面真的只有一个输出框、没有第二块可视单元时，不必硬造组件。

##### 交互跟笔记走（禁止偷懒压步骤 · 2026-09-10 立）

落 / 改 Demo **之前**对照该条沉淀 MD 的需求清单 + 例子 + 易混：笔记写了几步人机交互，页面就必须能逐步点完。**禁止**用「最简闭环 / 一个按钮跑完」代替笔记里的步骤。

| 笔记写了 | 页面必须有 | 禁止（偷懒） |
| -- | -- | -- |
| 先出计划再确认执行；确认前无副作用 | 至少两步：① 只要计划、状态是「未执行」② 人点确认才发执行请求 | 一个按钮既规划又执行 |
| 对照 A vs B（或 4 组） | 每一侧 / 每一组自己的请求；结果并排渲染 | 一个接口在服务端跑完所有组再返回 |
| 向导：第 N 步依赖第 N-1 步的结果 | 真实分步控件 + 中间态上页 | 一个表单填完一次提交 |
| 失败后改参再试 | 能看见失败观察，再看见下一圈改参 | 只展示最终成功 |
| 取消进行中的任务 | 请求发出后仍能点取消 | 按钮一按就等到结束 |

「服务端其实跑过了、前端只展示最终 JSON」≠ 实现了笔记里的交互。过关检查 3 把「压成一次点击」判 **未实现**。

**一页一个主教学点**：本 step 只允许一套主交互。对照的两侧算同一套教学点，**可以同页**。其它变体不是用 tab 堆进这一页，而是下一个 step 或 `public/pages/` 另一页。只读对照数字可以做成卡片，但数字必须来自**对应那一次请求**，不能靠一个超级接口顺手算出来。

页面并排对照 ≠ 一个超级 `/api/compare`。服务端禁止在一个 handler 里 `Promise.all([runA(), runB(), runC(), runD()])` 再打包返回。前端可以 `Promise.all` 同时发起多个 fetch——那是浏览器并发，不是把多条业务轨迹塞进一个 URL。

##### 文件行数硬上限（`check-demo` 拦 · 2026-09-10 立）

文件太大，人和 Agent 改起来都慢、容易改错。**超了先拆，不准「先写完再说」**。

| 文件 | 上限 | 超了怎么拆 |
| -- | -- | -- |
| `server.ts` | 120 行（原有） | 只留装配 |
| `routes/*.ts`（不含 `health.ts` / `error-demo.ts`） | **280 行** | 一个 URL 一个文件；循环 / 规划器抽到 `lib/flow/`；对照两侧拆成两个 route |
| `lib/` 业务 `.ts`（不含 `logger.ts` / `runtime-ctx.ts`） | **280 行** | 按职责再拆：`plan.ts` / `react-loop.ts` / `tools.ts`，不要一个 `flow.ts` 装所有策略 |
| `public/**/*.html`（含内联脚本） | **400 行** | 卡片 / 轨迹 / 对照表抽到 `public/components/`；无关场景抽到 `public/pages/` |
| `public/components/*.js` | **250 行** | 禁止再做一个塞满一切的 `ui.js`；一组件一文件 |

**生效**：此后**新落 / 新改**的 Demo / 新 step 强制。已锁定旧 Demo **默认不改**（`check-demo` 对 2026-09-10 前已超限 / 一文件多 URL 的**具体文件**豁免；新文件 / 新 step 文件夹不准再超）。复制旧 step 做 `step-(N+1)` 时，抄过来的超限文件**不算豁免**——必须先拆再加功能。

##### 怎么拆才算对（忌乱拆）

**按职责分层，不按「行数硬切」。** 同一类职责放同一子目录；主流程拆成可读的小函数（大约十几～二十行），**同层相关的小函数放在同一文件里**，不要一函数一文件。

| 问自己 | 拆 | 不拆 |
| ------ | -- | ---- |
| 本步核心（Agent 循环 / 调模型 / 规划器）学习者能不能打开**一个文件**读完主路径？ | 核心单独成文件，文件头写「本步核心」 | 不要把核心切成一堆 8 行碎片 |
| 两个页面/两个端点互不依赖，改 A 不该碰 B？ | 分文件 / 分页面 | — |
| 只是同一流程里的相邻步骤（parse → validate → handler）？ | 同文件多个小函数，或同目录相邻文件 | 不要拆成 5 个各 5 行的只有标题没实质内容文件 |
| 这段是「工具定义」还是「HTTP 错误」还是「主循环」？ | 放进对应职责目录（`tools/` / `http/` / `flow/` …） | 不要全堆进一个 `lib/helpers.ts` |
| 文件打开后，名字能否看出职责？ | `execute-one-tool-call.ts`、`pages/serial.html`、`components/rounds.js` | `utils2.ts`、`misc.js`、`temp.html` |

**后端 `lib/` 常见切法**（子目录名按本条语义取，不必照抄英文单词，但**必须**能一眼看出类）：

| 子目录 | 放什么 | 不放什么 |
| ------ | ------ | -------- |
| `tools/` | Registry、`defineTool`、各 Tool 的 Zod + handler 定义、Tool 类型 | HTTP ctx、LLM 循环 |
| `schema/` | Zod ↔ JSON Schema 等契约转换 | 业务 handler |
| `tokenize/` / `vec/` | 本地计算（encode、余弦、玩具向量表） | HTTP ctx |
| `flow/` | **本步核心**单独成文件：Agent 循环、调模型、规划器、按清单执行。文件头写「本步核心：……」 | koa `ctx` 读写；不要把核心埋进 route |
| `http/` | PORT/llm 单例、入参校验、上游错误透传 | Tool 业务逻辑 |

- `server.ts` **只做装配**：读 PORT、`bodyParser`、`router` 挂上各 `routes/*`、`serve(publicDir)`、`listen`、启动日志。
- `routes/{语义名}.ts`：薄封装——校验入参 → 调 `flow/` → 写 `ctx.body`。禁止把整段 loop 再抄回 route。
- `lib/` 只服务本小节，不 import 其它小节。不调 LLM 的本地计算 Demo **同样走 HTTP + 页面**，入口仍是 `server.ts`；禁止另开 `index.ts` 当主入口。

**前端 `public/` 常见切法**：

| 位置 | 放什么 |
| ---- | ------ |
| `index.html` | 总览 / 导航；可展示 Registry；**不要**堆齐所有用例按钮+结果 |
| `pages/{场景}.html` | 一个独立教学场景一页（`run.html` / `serial.html` …）；语义文件名 |
| `components/` | 共享 JSX，**按职责分文件**（如 `layout.js` = 导航/状态条；`rounds.js` = Round/ToolCall 卡片）。挂 `window.DemoUI`。禁止再做一个塞满一切的 `ui.js` |
| `utils/` | 无 JSX 的公共方法（`api-client.js`、`wait-demo-ui.js` …）。普通 `<script src>`，挂 `window.DemoUtils` |

- 页与页用普通 `<a href="/pages/serial.html">` 跳；禁止单页 tab 把无关场景叠回去。
- 仍禁止 `type="module"` / `import` / 打包器；每页 `<head>` 各自引入 Tailwind / React / ReactDOM / Babel。
- 加载顺序见 [§5.3.4](#534-html-固定骨架强制)：utils（普通 script）→ components（babel src）→ 本页内联块。

**注释（前后端同一套，与 [§5.0](#50-代码落点规范node--ts--注释--key--选型) 对齐并加严）**

- 每个文件头：**职责**（这个文件干什么）+ **数据流**（进什么、出什么）+ 必要时 **为什么单独成文件**。核心流程文件额外写 **本步核心：……**（一句人话）。
- 分段用 `// ── ... ──`；关键行写**为什么**，不要复述代码字面意思。
- route / 页面内联块：点明「本页只演示哪一个教学点」，避免读者以为所有场景都在这一页。

**注释密度下限**（写完自查，缺哪条补哪条）：

| 位置 | 至少要有 |
| ---- | -------- |
| 后端 `lib/` 主流程函数 | 每个关键步骤一行 `// ①②③` 说明「这一步防住什么 / 顺序为什么不能换」 |
| 后端易踩坑处 | 中间件顺序、绝对路径、协议要求的消息顺序、`any` 的理由，都要写清后果 |
| 前端 `components/*.js` | **每个组件**一段注释：这个组件表示协议里的什么、颜色/徽标的判断依据 |
| 页面内联块 | 顶部一段「本页教学点」；**每个 useState** 一句用途；事件 handler 说明有哪几种失败分支 |
| 页面 JSX | `#page-intro` / `#controls` / `#output` 各一行说明它承担 §5.3.10 里的哪个角色 |

**禁止**：只写「// 定义变量」「// 渲染列表」这种复述；改了行为不改注释。

**禁止**

- 为拆而建空 `routes/` / `lib/` / `components/`
- 平铺一大坨无分类的 `lib/a.ts` `lib/b.ts`，或前端只留一个巨型 `ui.js`
- 一函数一文件、五六行只有标题没实质内容「拆分」
- 场景页之间 ESM import
- 把「拆文件」理解成「拆成多个 Demo 文件夹 / 多个端口」
- 用现有某条 Demo 当模板去抄；对照本节 + §5.3.4 骨架写
- 含糊文件名：`helper` / `common` / `misc` / `temp` / `ui`（当它已是整包杂烩时）
- 用「对照必须拆页」当借口拆成两个 HTML，学习者对不上差异；用「对照可以同页」当借口：一个 `/api/compare` 打包跑多条轨迹、两侧 JSX 全堆进 `index.html`
- 把本步核心（Agent 循环 / 调大模型 / 规划器）写进 `routes/*.ts`，学习者打开 Demo 找不到主路径
- 笔记写了多步交互，代码却做成一个按钮（§5.3.8 交互跟笔记走）

**`coach complete` 过关检查补一句**：该落可运行时，`server.ts` 仍须是 yarn 入口；本步核心在 `lib/flow/` 单独文件（文件头有「本步核心」）；一个业务 URL 一个 route 文件；对照可以同页但每侧分请求、页面拆组件。过关检查 2 另查「交互跟笔记走」+「对照拆请求」+「主流程单独成文件」；`check-demo` 拦行数上限和一文件多 URL。

#### 5.3.9 环境元信息（`/health` + 页脚，强制）

2026-09-03 维护模式起生效。**每个 HTTP Demo 都要让人一眼看出「这一页现在在用谁家的哪个模型」**，不能靠翻 `apps/.env` 猜。

**接口（每条 HTTP Demo 都要有，即使只有一个页面）**

```ts
// routes/health.ts —— 只读，不调模型
router.get("/health", (ctx: Context) => {
  ctx.body = {
    ok: true,
    port: PORT,
    provider: llm?.provider ?? null,   // 来自 apps/llm.ts，禁止页面写死
    model: llm?.modelA ?? null,        // 协议 B 页用 modelB；两个都用就都回
    hasKey: Boolean(llm),
    // 本条自己的元信息可继续加（如 tools: [...]）
  };
});
```

**显示位置：页脚 `#env-info`**（唯一权威位置）。

| 放哪 | 放什么 | 为什么 |
| ---- | ------ | ------ |
| `#page-header` | 页名 `#page-title` + 状态 `#status-pill` | 顶部只留「我在哪、现在什么状态」，右上角状态一眼可见 |
| `#page-footer > #env-info` | `端口 · 协议 A/B · provider · model · Key ✅/❌` | 环境是全页一致的背景信息，多页 Demo 每页都同一处，不与业务区抢注意力 |

- 页面**加载时**就打 `GET /health` 填上；没拿到写 `(待连接)`，**不要**空白。
- `hasKey: false` 时页脚显示 `Key ❌（apps/.env 未配置该家 Key）`。**本条会调模型**时再让主按钮 `disabled`——比等请求 503 更早告诉人。
- **本条不调 LLM**（本地 encode / Zod 等）：`/health` 仍回 provider / model / hasKey，并加 `callsModel: false`。页脚写「本地计算 · 不调 LLM」；**主按钮不因缺 Key 而 disabled**。
- 多页 Demo：抽成一个共享组件（如 `components/layout.js` 的 `EnvFooter`），每页调用，**不要**每页各写一遍。
- 禁止：把 provider / model 写死在 HTML；只在 `#controls` 里显示而页脚不显示；多个页面显示位置不一致。

#### 5.3.10 统一 UI 语汇（三类区域，强制）

**同一条 Demo 的所有页面、以及不同 Demo 之间，同类信息必须长得一样**，这样换一条 Demo 也不用重新认界面。

| 区域 | id / 用途 | 统一样式 |
| ---- | --------- | -------- |
| **说明区** | `#page-intro` | `bg-white shadow rounded p-4`；正文 `text-sm text-gray-700`，步骤 `text-xs text-gray-600` |
| **功能区** | `#controls` | `bg-white shadow rounded p-4 space-y-3`；主操作按钮 `bg-blue-600 text-white`，次要 `border border-gray-300`，一律带 `disabled:opacity-50` |
| **输出区** | `#output` | `bg-white shadow rounded p-4 space-y-4 min-h-[200px]`；空态必须有一句灰字说明 |

**输出区内部，三种内容必须可区分**（颜色语义固定，不要每条 Demo 自创一套）——[AGENTS.md §5.3 高频遗忘](../AGENTS.md#53-小节-Demo-完整版前后端--react--koa2026-09-02-维护模式起生效)：**请求参数 / 调用流程 / 响应结果**三件都得上页，不只露成功按钮。

| 内容 | 语义 | 样式约定 |
| ---- | ---- | -------- |
| **用户输入 / 请求参数** | 我发出去的 | 中性灰：`bg-gray-50` + `text-gray-700`，`prompt:` 之类前缀 |
| **模型输出 / 最终答案** | 给用户看的终态 | 绿系强调：`bg-green-50 border-green-300` |
| **系统 / 协议事件**（tool_call、校验、重试、错误） | 过程可观察量 | 成功 `border-green-300 bg-green-50`；失败 `border-red-300 bg-red-50`；中性事件 `border-gray-300 bg-white`；徽标用 `text-xs px-2 py-0.5 rounded` |

- 原始 JSON / 长文本：`<pre className="whitespace-pre-wrap … max-h-32 overflow-auto">`，禁止撑破页面。
- 耗时、轮次、HTTP 状态这类元信息：`text-xs text-gray-500`，放卡片右上。
- 中文正文 + 英文术语（`tool_call` / `finish_reason` 不要硬译）。

#### 5.3.11 页面必须自解释（教学注解，强制）

**这些 Demo 的读者是「几个月后回来复习的自己」**。合上文件后还能自己讲出来只看页面，也要能讲清这一页在演示什么。教学信息写在**页面上**，不是只写在 README 或代码注释里。

> 强约束，对应 [AGENTS.md §5.3 高频遗忘](../AGENTS.md#53-小节-Demo-完整版前后端--react--koa2026-09-02-维护模式起生效)：**请求参数 / 调用流程 / 响应结果**三件都得上页，不要只露成功按钮。

| 位置 | 必须写什么 | 例子 |
| ---- | ---------- | ---- |
| `#page-intro` | ① 一句「本页只演示 X」；② 3～5 步数据流（点了按钮 → 服务端做什么 → 结果怎么回来） | 「本页只演示并行 tool_call：一次返回两个调用，服务端 `Promise.all` 执行」 |
| 每个按钮 / 输入框旁 | 一句「点了会发生什么、期望看到什么」 | 「跑并行：期望 Round 1 出现 2 个 tool_call」 |
| 输出区每个卡片 | 这一块对应协议里的哪个字段 / 哪一步 | 「tool_result（执行结果 → 塞回 messages模型）」 |
| 关键判定处 | 为什么是这个结果、判错会怎样 | 「Zod ✗ → 错误当 tool_result 塞回 messages，模型才有机会改对」 |

- 总览页（多页 Demo）额外画一张全局数据流（`<pre>` ASCII 即可）+ 各场景一句话导航。
- 术语第一次出现跟一句人话解释；不要只堆 `finish_reason=tool_calls`。
- 分寸：解释「这一步在协议里是什么」，**不要**把小节 MD 的完整教学搬进页面。页面是「看得见的机制」，MD 是「讲透的知识」。
- 禁止：只有按钮没有任何说明；用 `TODO` / `待补充` 占位；说明与实际行为不符（改了行为必须改说明）。

##### §5.3.11.a 用户可见文案格式 · 中文为主 + 英文括注（2026-09-09 立 · 强制）

**目的**：页面对中文学习者是默认入口，但代码 / API 字段名 / 协议 / 关键术语是英文的，**完全去掉英文**会断掉与代码的对应关系；**只写英文**又对中文学习者不友好。统一规则：**中文为主，关键术语用括号附英文**，让学习者看一眼既懂意思又能对得上代码。

**适用范围**：所有用户**能看到**的字符串（HTML `<title>` / `<h1>` / 按钮文案 / 可调参数标签 / 卡片标题 / `#page-intro` 文案 / 状态栏文案 / 错误提示 / 页脚 `#env-info`）。

**格式范本**（每类都有约定，照抄即可，不要自由发挥）：

| 位置 | 格式 | 例 |
| -- | -- | -- |
| 页面 `<title>` | `中文名 · 第N步` | `Token 预算管理 · 第一步` |
| 主标题 `<h1>` | `中文名（English Name） · 第N步（step-N） · 一句话教学点` | `Token 预算管理（Token Budget） · 第一步（step-1） · 三块分账 + 拼装前打印 + 超预算裁最旧` |
| 可调参数标签 | `中文描述（字段名 · 单位）` | `历史对话轮数（historyCount · 每轮 = 1 条 user + 1 条 assistant）` |
| 预算表行 | `中文段名（英文）` | `系统提示段（system）` / `历史对话段（history）` / `给模型输出的预留（output budget）` / `三块合计（total）` / `总预算上限（totalBudget）` |
| 状态/按钮 | `中文（English · 类别）` | `跑预算（算账 → 裁剪 → 调真模型 · runBudget）` / `演示上游失败（5xx · 第二类错误 · /api/budget-force-error）` |
| 判定标签 | `中文判定（字段名）` | `是否提到关键事实（hasKeyFact）` / `model = MiniMax-M3 · dropped = 50 条` |
| 页脚 | `端口 XXXXX · 协议 A（openai Chat Completions） · 模型服务商 / 模型 / 密钥` | `端口 50045 · 协议 A（openai Chat Completions） · 模型服务商 minimax · 模型 MiniMax-M3 · 密钥 ✅` |
| 角色 | `中文（English）` | `角色：用户（user）` / `角色：助手（assistant）` / `角色：系统（system）` |
| 单条消息 token 估 | `≈ N 个 token` | — |
| 端点路径 | `/api/...` 保留 | — |
| 协议 / 状态 | `4xx` / `5xx` / `协议 A` / `协议 B` 保留 | — |

**禁止**：

- 完全用英文写用户可见文案（中文学习者看不懂）
- 完全去掉英文（代码 / 字段名 / 端点都对不上）
- 括号里塞长句子（括注是「一眼能扫到的术语」，不是完整翻译）
- 关键英文术语不带括注直接消失：`triggered` / `dropped` / `messages` 数组 / `summary` / `history` / `budget` / `output` 这类**概念词必须留英文括注**
- 「可以保留」清单里的东西被强行翻译：`Key ❌` → `密钥 ❌` ✅；`protocol A` → `协议 A（openai Chat Completions）` ✅；`hasKey` → `密钥`（用户的语义）✅

**JS 变量名 / API 字段名 / CSS className / HTML id**：**不**改。代码层的 `result.trim.hasKeyFact` / `data.replyTokens` / `id="page-title"` 必须和 API 字段一致才能对得上 — 只在**显示给用户的字符串**里加括注。

**check-demo 怎么查**：scan `<h1>` / 按钮 / 可调参数 / 卡片标题 / 页脚 — 出现 `Key` 单字（应改成「密钥」）/ 出现 `provider` 单词直接展示（应改成「模型服务商」）/ 出现 `model` 单字（应改成「模型」）/ 出现 `summarizeFrom` 单独展示（应改成「远期喂摘要的条数（summarizeFrom）」）这类**没中文化的纯英文术语** → FAIL。**协议 A / B / 4xx / 5xx / token / ID / API 路径** 保留不查。

##### §5.3.11.b 写完 Demo 后必须输出「改了 + 为什么」+ 页面要看得见核心（2026-09-09 立 · 强制）

**目的**：避免「写完就完事」— 学习者想知道**这一步动了什么、为什么这么动、这个 Demo 核心教学点是什么**。前两件给 Coach 输出（让学习者知道方向对不对），最后一件给前端页面（让几个月后回来复习的自己也能一眼看见）。

**必做（三件不可省）**：

| # | 做什么 | 在哪 |
| -- | -- | -- |
| **1** | **改动总结** — 这一版 Demo 比上一版**改了什么**（点列） | Coach 在本对话里直接打（不是写文件） |
| **2** | **为什么这么改** — 每条改动背后的理由（核心点 / 教学点 / 修复 bug / 满足新需求） | Coach 在本对话里直接打（不是写文件） |
| **3** | **核心教学点输出到页面** — 这个 Demo 到底在演示什么、怎么观察、关键判定怎么读 → 在 `#page-intro` 用一段独立的「核心教学点」卡片显式写出来 | `public/index.html` 的 `#page-intro` 段内 |

**第 3 件的具体形态**（落 `index.html` 时按此模板写）：

```jsx
<section id="page-intro" className="bg-white shadow rounded p-4 space-y-2">
  <p className="text-sm text-gray-700">本页只演示：<b>{一句话教学点}</b></p>
  <ol className="text-xs text-gray-600 list-decimal pl-5 space-y-1">
    <li>{步骤 1}</li>...
  </ol>

  {/* 核心教学点卡片（强制 · 2026-09-09 立） */}
  <div id="core-takeaway" className="bg-yellow-50 border border-yellow-300 rounded p-3 space-y-1 mt-2">
    <div className="text-xs font-semibold text-yellow-900">本页核心教学点</div>
    <div className="text-xs text-gray-800">{这一页要让人带走的 1~3 句核心结论}</div>
    <div className="text-xs text-gray-600">{怎么在结果里观察到这个核心点}</div>
  </div>
</section>
```

**核心教学点**的写法（避免变成空话）：

- ✅ 「Token Budget 的三块分账 = system + history + output；唯一可裁的是 history；output 是预留不是事后裁」
- ✅ 「丢最旧 vs 摘要压缩的可观察对照：同一份 history、同一问句，trim 路径忘 key fact（丢了字面）但 summarize 路径记住（summary 留语义）」
- ❌ 「本 Demo 演示 Token Budget 的基本功能」— 没信息
- ❌ 「本页很重要」— 不是教学点

**Coach 的输出**（改完 Demo 之后，按下模板打）：

```text
## 这一版 Demo 改了什么 + 为什么

### 改动（按重要性倒排）
1. 改了 X 文件第 Y 行 ...（核心）
2. 加了 Z 字段 ...（教学点）
3. ...

### 为什么这么改
1. 第 1 条改动：满足需求 N / 修复 bug M / 加深变体 K
2. ...

### 没改的（避免误改）
- A / B / C（明确不动的 + 原因）
```

**禁止**：

- 写完 Demo 只说「完成了」/「跑通了」— 必须有「改了 + 为什么」明细
- 核心教学点只放代码注释 / README，**不**进页面（违反 §5.3.11「合上文件后还能自己讲出来只看页面也要能讲清」的本意）
- 核心教学点写成「本 Demo 演示 XX」空话

#### 5.3.12 生产级底线 + 独立性

**「Demo」只是规模小，不是可以糙。** 每条按能上线的小应用要求：

| 项 | 要求 |
| -- | ---- |
| 三态齐全 | 空态（还没跑）、加载态（`#status-pill` + `disabled`）、错误态（红字 + HTTP 码 + 上游 `upstreamStatus`），都要有文案 |
| 防重复提交 | 请求中所有触发按钮 `disabled`；不做「点两下发两次」 |
| 错误可读 | 面向人的中文一句话 + 原始信息；禁止只 `console.log` 后页面无反应 |
| 无死代码 | 不留没接线的按钮、没用到的组件、注释掉的旧实现、`TODO` |
| 可 grep | 强制 id 不改名；组件 / 函数名语义化（[§5.3.8](#538-http-demo-拆分多场景--多接口时强制)） |
| 响应式 | 卡片列表用 `grid-cols-1 md:grid-cols-2` 之类；窄屏不横向滚动 |
| 类型与校验 | 服务端入参 Zod 或显式校验；`catch (err: unknown)` |

**独立性（不因为拆分而互相引用）**

- 允许 import 的**只有** `apps/llm.ts`（`getLlm` / `getLlmOptional` / `logLlmConfig`）、`apps/load-root-env.ts`（环境变量）——顶层基础设施。
- **禁止**运行时 `import apps/logger.ts` / `createLogger` 委托顶层（[§5.3.16](#5316-详细日志强制)：顶层只是拷贝模板；每条 Demo 必须自带完整 `lib/logger.ts`）。
- **禁止**：小节 A 的 `lib/` / `routes/` / `components/` / `utils/` 被小节 B import；把某条 Demo 的 UI 抽成跨 Demo 公共包；import 模块 00 mini-app。
- 每条 Demo 内部的 `components/` / `utils/` **只服务本条**。要在新 Demo 用同样的组件：**照本节规则重写一份**（可以照抄自己写过的思路，但文件归本条所有），不要跨目录引用。
- 重复几十行 UI 是可接受成本；跨条耦合不是——改一条会连坐别条，教学 Demo 必须能单独删掉。

#### 5.3.13 协议 A / 协议 B 分开落 Demo（强制）

2026-09-03 维护模式起生效。**默认一份 Demo 只跑一个协议。** 同一条小节既要 A 又要 B → **另起一份 Demo 文件夹**，不要在一份里塞两套 SDK。

**为什么**：两家 SDK 的请求体、消息结构、错误形状都不一样。挤在一个 `server.ts` / 一个页面里，代码会长满 `if (protocol === "b")` 分叉，教学点被淹没；拆开后每份都是干净的单协议闭环，删掉一份不影响另一份。

| 项 | 协议 A 版 | 协议 B 版 |
| -- | --------- | --------- |
| 文件夹 | `{小节两位}-{短名}/` | `{小节两位}-{短名}-ProtoB/`（后缀标明协议） |
| yarn 脚本 | `app:{模块}-{小节}-{短名}` | 同前缀 + 一眼看得出是协议 B 的短名（`…-proto-b` / `…-anthropic-…` 均可）。**小节两位沿用真实小节号**，不要改成 +10 |
| 端口 | `5{模块}{小节}` | 走 [§5.3.3](#533-目录与脚本)：`5{模块}{小节+10}`；占用表已有则继续 +10，禁止和另一条的默认口重复 |
| SDK | 只引 `openai` | 只引 `@anthropic-ai/sdk` |
| 页脚 `#env-info` | 写 `协议 A` + `model`（`llm.modelA`） | 写 `协议 B` + `model`（`llm.modelB`） |
| README | 顶部一行指向对方那一份 | 同左 |

两份都各自满足 [§5.3.2](#532-完整版--必做的-6-项替代-52-最低标准) 六项；**互不 import**（[§5.3.12](#5312-生产级底线--独立性)），共享的只有 `apps/llm.ts`。

**唯一例外：该行「重点」本身就是协议 A/B 对照**

小节进度那一行讲的就是「两套协议差在哪」（如模块 02「**协议 A vs B**」）时，同页并排才看得见差异，允许一份 Demo 同时用两家。但必须**分层隔离**，不许混着写：

```
{小节}-{短名}/
├── lib/
│   ├── protocol-a/     ← 只有 openai 的请求 / 解析 / 类型
│   ├── protocol-b/     ← 只有 @anthropic-ai/sdk 的请求 / 解析 / 类型
│   └── compare/        ← 真正协议无关的部分（同一份 prompt、并排结果的形状）
├── routes/             ← 可以有 /api/run-a、/api/run-b，一个协议一个文件
└── public/             ← 并排展示；页脚 #env-info 同时写 modelA / modelB
```

- 例外只对「对照」这一个教学点开；不要用它当借口把任意 Demo 写成双协议。
- 例外条也禁止在 **route / 协议实现** 里 `if (protocol === "b")` 分叉 —— 分叉只允许发生在 route 层的两个文件。
- **适配层 Demo**（教学点是「业务只调 `sendMessage`」）：允许 **adapter 入口**两行 `if (opts.protocol === "A")` 再转发；SDK 调用仍必须分属 `protocol-a/` / `protocol-b/`，禁止在 adapter 里直接 `new OpenAI` / `new Anthropic`。

**其它既有例外 / 边界**

- 已 ✅ 的旧 Demo **默认不回头改结构**，除非学习者明确说要。
- 禁止：一个 route 内按协议分叉；页面用 tab 在 A/B 之间切（对照条走并排，不是切换）；B 版复用 A 版的 `lib/`。

**`coach complete` 过关检查补一句**：本条同时演示 A 与 B 时，`apps/` 下必须能看到两个文件夹 + 两条 yarn 脚本 + 两个端口；属于「对照」例外的，`lib/` 下必须有按协议分开的子目录。

#### 5.3.14 Demo 子节拆分（动态引导，由浅入深）·新

2026-09-03 维护模式起生效。

**问题**：旧模型一次预判 N 步、一次连落。学习者看完代码发现「不需要那么多步」或「这步漏了 X」都没法低成本修正。新模型：**总目标清晰，N 动态**。step-1 是最简入口；step-N 是工作区（自由打磨）；**学习者主动说「锁定」**才进入下一步；锁定那一刻才算这一步完成。

#### 教练驱动 vs 学习者主动（默认）

2026-09-03 维护模式起生效。

**问题**：本节其他子条款（「锁定 = 学习者主动」「step-N = 工作区」）容易被读成"教练等学习者说再做"。但学习者从空 MD 起步时，对"这条**最完美 / 最深度 / 最广度**的 Demo 长什么样"没有先验视角——而教练有（来自「本条要能讲清」+ 配套模块沉淀 + 已落同模块其它小节）。**教练不引导 = 教学责任缺位**。

**规则**：

| 角色 | 怎么做 |
| --- | --- |
| **教练（默认）** | 已知道这条**最完美**的 Demo 长什么样（教学点覆盖、深度、广度）。主动一步步提议："现在 X，下一步加 Y 让它更深；锁后进 step-(N+1) 做 Z"。**不**停下来问"你想做什么"——按已知的"最完美路径"推 |
| **学习者主动介入** | 想停 / 想慢 / 想换方向 → 立刻停下按学习者走。"我没看明白这个"=在 step-N 内再讲 / 再修；"我想先做 X 而不是 Y"=换路径；学习者主动锁=freeze |
| **禁止** | 每步都问"你想加什么" / 把整个 step-N 规划权丢给学习者 / 拿"等学习者说"当借口不做主动引导 |

**理由**：教学节奏因人而异，但**默认推进方向**应当是教练有把握的"最完美 Demo"那条线。学习者主动喊停 = 边界，**不是**常态。停太频繁 = 学习者累；推太快 = 学习者迷。**踩中间**：教练主动，但每步提议都给学习者改判的机会（见下面「交互检查点协议」第 ④ 步「Coach 主动建议三条路（学习者可忽略 / 改判）」）。

**核心差异**：

| | 旧模型 | 新模型 |
| - | ------ | ------ |
| N 怎么定 | §5.2 Demo 判断时预判写 N | **动态**；学习者主动决定何时加下一步 |
| step-N 内能改吗 | 不能改（增量构建规则） | **能改**（step-N 是工作区，自由打磨） |
| step-N 何时算「完成」 | 跑通 + check-demo 过 → 自动锁 | **学习者主动说「锁定这步」** + check-demo 过 + §5.3.2 6 项齐 → 锁 |
| §5.3.2 6 项要求时机 | 每步必过 | **只在锁定时必过**；step-1 可以是 sketch（不满足 §5.3.2） |
| §5.2 Demo 判断表 | 写「子节拆分：N」 | 写「step-1 起手」+「锁定时机：学习者主动决定」+「N 动态」 |
| 小节 MD「Demo 子节进度」表 | ⬜/🔄/✅ 三态 | **🔄（打磨中）/ ✅（锁定）** 二态 |

##### step-N = 工作区（自由打磨，不是状态机）

step-N 文件夹是当前**工作区**，不是状态机：

- 在这个文件夹里**自由改、加、删、重构**——这是学习过程的一部分
- check-demo.cjs 过没过 ≠ 锁没锁；中间过程允许 fail（coaching 中修代码再跑）
- git history 自然记录所有改动；不需要专门写「v1 / v2 / final」之类标签
- 一句话：「学习者主动说停 / 进入下一步时锁定的版本能讲清就行，中间改了 50 次没关系」

##### 锁定 = 学习者的主动决策（不是自动触发）

**学习者主动决定**：「这步够好了，进下一步」→ 这一刻 freeze 当前代码，三件事**同时**满足：

1. 学习者主动说「锁定」
2. `node scripts/check-demo.cjs apps/{模块文件夹}/{小节文件夹}-step-N` 过
3. §5.3.2 6 项齐（**完整版门槛只在锁定这一刻校验**）

满足后：写入「Demo 子节进度」表，标 ✅；step-N 文件夹此后**冻结**。

**唯一例外**：锁定后真发现 bug → 修 → check-demo 过 → 仍是同一个 step-N（不破坏锁定）。**判定**：是否改动了「本子节教学点」对应的代码结构？只换字符串 / 修类型错误 = bug 修；新增端点 / 换协议 / 加 Tool = 新功能，**必须**建 `step-(N+1)`。

**为什么学习者决定**：

- 学习节奏因人而异；同一份代码，有人看 10 分钟就懂，有人要改 3 次才懂
- 教练不该替学习者判断「这步够好了」
- 锁定那一刻的代码就是「教学点的最佳表达」——比「最终完美版」更适合回头复习

##### §5.3.2 6 项 = 完整版门槛（不是每步门槛）

| step-N 当前形态 | §5.3.2 要求 |
| --------------- | ----------- |
| **sketch**（1 函数 / 伪代码 / 几行） | **不要求**；目的是让学习者**看见**概念或**跑一遍**最简闭环 |
| **半成品**（开始有 endpoint + UI + happy path） | **部分要求**（至少有 happy path + loading）；不强制 health / env-info / 两类错误 |
| **锁定那一刻** | **必须**满足 6 项；check-demo.cjs 过 |

**过关检查只在「锁定」时校验**。step-1 起手可以小到「1 个端点 + 1 个按钮 + 1 个 #output，调真 LLM」，不需要 health / env-info / 两类错误。等学习者说「锁定」，再补齐 §5.3.2 → 过 check-demo。（§5.3.0 硬规则：默认调真模型，**禁止**用本地 mock 凑最小闭环；本地计算 / 纯协议形状演示例外）

##### 交互检查点协议（每步之间必走）

step-N 当前状态跑通后，**必须**走完以下流程再决定下一步，禁止跳步：

```
1. step-N 当前状态跑通（不一定满足 §5.3.2；可以是 sketch）
2. Coach 用 06-teach.md 讲清 step-N 当前的核心教学点（需要时）
3. Coach 问：「step-N 你懂了吗？还有疑问吗？」
   ├─ 学习者说懂 → 进 4
   └─ 学习者有疑问
       ├─ 概念没讲透 → 再讲（06-teach.md）
       ├─ step-N 代码有问题 → 在 step-N 内修（这是工作区，自由改）
       └─ 想停 → 停，听学习者的，不强推
4. Coach 主动建议三条路（学习者可忽略 / 改判）：
   ├─ 「锁定这步」 → 进 5a
   ├─ 「继续打磨这步，加 X 让它更稳」→ 在 step-N 内加，再回 1
   └─ 「下一步加 Y 进 step-(N+1)」→ 进 5b
5a. 锁定：check-demo.cjs 过 + §5.3.2 6 项齐 → 标 ✅ → 等学习者决定「下一步加什么」
5b. 教练提议 step-(N+1) 加什么 → 双方确认 → 建 step-(N+1) = copy 锁定的 step-N + 加新功能
6. 回到 1
```

**禁止**：

- 教练一次连落多步（旧模型残留，必须改）
- `coach complete` 不过时一次打包补多个 Demo 缺口（必须走 [03-progress 不过时的收口](./03-progress.md#不过时的收口逐条列全--由浅入深一次只做一件--2026-09-05)：列全 + 只推由浅入深第 1 步）
- 教练替学习者决定「这步够了」（锁定是学习者的决策，**不是**自动触发）
- 跳过第 3 步直接进第 4 步（学习者没确认懂之前不该推进）
- step-N 锁定后偷偷改代码（违反「锁定 = 冻结」；要改 = 建 step-(N+1)，bug 修复除外）
- 在 step-N 内「加开关变量 + 条件渲染」做 step-(N+1) 的功能（隐藏分支；用 copy + delta 增量构建）

##### step-1 起手（§5.2 Demo 判断表写）

§5.2 Demo 判断表**不预判 N**，只写 step-1 起手。原则：

- `step-1` = **能多小就多小**；目的是让学习者**看见**概念或**跑一遍**最简闭环
- **推荐起手 A**（仅当本步教学点就是「单次调用」时）：「1 个端点 + 1 个按钮 + 1 个 #output」，调真 LLM 跑一次 happy path；§5.3.0 硬规则禁止本地 mock 凑闭环
- **若本步教学点本身就是多步交互或对照**：起手也必须是多步 / 分侧请求。禁止用「最简闭环」当借口把笔记里的步骤压掉（[§5.3.8 交互跟笔记走](#538-http-demo-拆分多场景--多接口时强制)）
- 其他可选项 B（请求/响应 JSON 静态展示）/ C（纯伪代码）——教练按本条特性选
- §5.3.2 6 项**不要求**（这是 sketch，不是完整版）
- 由浅入深：先让学习者**看见**概念长什么样 → 再**用**概念做事 → 先**跑起来** → 再**打磨成完整版**

##### 目录与脚本（每步独立）

```
apps/{模块文件夹}/
├── {小节文件夹}-step-1/       ← 工作区（自由改；锁定后冻结）
│   ├── server.ts · routes/ · lib/ · public/ · README.md
├── {小节文件夹}-step-2/       ← copy 锁定的 step-1 + 加新功能
├── ...
└── {小节文件夹}-step-N/
```

**扁平结构**（无 step-N/ 嵌套）：`-step-N` 直接拼到小节文件夹名后缀，多个 step-N 是同模块下的兄弟文件夹。section 级别的导航表见 `docs/学习模块/{模块}/{小节}.md` 的「Demo 子节进度」块，不再有 section 父 README。

- yarn：`app:{模块两位}-{小节两位}-{英文短名}-step-{N}`，每步独立保留
- 端口：`5{模块两位}{小节两位 + 10×(N-1)}`，撞车继续 +10（沿用 [§5.3.3](#533-目录与脚本) 第 N 份公式）
- 锁定时必须过 `node scripts/check-demo.cjs apps/{模块文件夹}/{小节文件夹}-step-N`（check-demo.cjs 传父目录时扫所有 server.ts，扁平/嵌套都兼容）

##### 增量构建（从**锁定**版本复制）

`step-(N+1)` 的产出 = **锁定的** `step-N` 的**完整复制** + 本步教学点对应的**增量代码**。注意：是**锁定时**的版本，不是中间任何临时状态。

| 增量类型 | 怎么做 |
| -------- | ------ |
| 新加端点 | `routes/` 加文件 + `server.ts` 加 `mountXxx(router)` 一行；上一步里没有的端点不删 |
| 新加 UI 场景页 | `public/pages/{场景}.html`；`index.html` 加导航链接 |
| 新加共享组件 | `public/components/{职责}.js` 挂 `window.DemoUI` |
| 替换既有行为 | 改当前 step 的对应文件；**不**回去改上一步 |
| 请求示例 / 入参样例 | 改当前 step 自己的；上一步保留旧值 |

**禁止**：在 `step-N` 基础上「加开关变量 + 条件渲染」做出 `step-(N+1)`；那样回头看 `step-N` 会发现代码里有「未启用分支」。要追加就实打实写一遍新代码——重复几十行是可接受成本；隐藏分支不可接受。

##### 同步更新规则（demo 改名 / 路径变 / 脚本名变时）

任何 demo 改名 / 路径变 / 脚本名变（如 `app:01-06-embedding-step-1` → `app:01-06-embedding-step-1`；`02-Embedding/` → `02-Embedding-step-1/`），**必须同步更新所有引用该 demo 的文档**，禁止留旧名残留。范围（不完整清单，每加一种新 demo 类型 / 新文档类型都要扩）：

| 类别 | 必查文件 / 必改字段 |
| ---- | ------------------ |
| **代码** | `apps/package.json`（脚本名 + tsx 路径）、被改动的 demo 自己的 `apps/{demo}/README.md`（yarn + 端口 + 路径） |
| **占用表** | `apps/README.md` 表格 + 文末说明 + 注释里的例 |
| **沉淀** | `docs/学习模块/{模块}/{小节}.md`（每个引用都要更新）、`{模块}/README.md` 进度表 / 验收表、`{模块}/{模块复盘}.md` 的 demo 表 / 跨条说明 |
| **外围** | `docs/06-学习总览.md`、`docs/03-学习路线.md`、`docs/02-怎么用.md` |
| **协议** | `AGENTS.md` §4 / §5.2 + §6.1、`agents/05-demo.md` / `agents/07-notes.md` / `RESET.md` 的所有模板与例子 |
| **白名单** | `.claude/settings.local.json` 的 `Bash(yarn app:...)` |
| **生成产物** | `manifest.json`（如存在） |

**禁止**：

- 只改 `apps/` 代码、不改 docs（doc 与代码脱节是最常见的回归）
- 只改一两条引用、漏其它文档
- 「后面再补」/「下条再改」

**完成后必跑验证**（确认无残留）。例：把 `app:01-06-embedding-step-1` 改名时：

```bash
# 1. grep 旧脚本名（要带 PCRE 用负向预查，或 grep -v step-1 排除）
grep -rn "app:01-06-embedding-step-1" . --include="*.md" --include="*.json" --include="*.cjs" --include="*.ts" | grep -v "step-1"
grep -rn "01-AI与LLM基础认知/06-Embedding-step-1" . --include="*.md" --include="*.json" | grep -v "step-1"

# 2. yarn check-demo 仍过
cd apps && yarn check-demo
```

`grep` 必须为空 + `yarn check-demo` 必须过。**任何一处漏 = 该步不算完成**。本规则适用于所有维护场景（批量迁移 / 单条 demo 重命名 / 重构），不限于 step-N 拆分。

##### 小节 MD 的 `## Demo 子节进度` 表（动态增长）

**位置**：`docs/学习模块/{模块}/{小节}.md` 的「是什么 / 机制」等教材节之后，「过关自检」之前。

**状态**：

| 状态 | 含义 |
| ---- | ---- |
| 🔄 | step-N 已建，工作区自由打磨中；未锁定 |
| ✅ | step-N 已锁定（学习者主动锁定 + check-demo 过 + §5.3.2 6 项齐） |

**写法**：**逐步添加**，禁止一次写满 N 行。

| 时机 | 怎么写 |
| ---- | ------ |
| **step-1 创建** | 加表头 + step-1 那一行（🔄） |
| **step-1 锁定** | 改该行状态 🔄 → ✅ |
| **每加一步** | append 一行新 step-N（🔄） |
| **每锁定一步** | 改该行状态 🔄 → ✅ |
| **学习者决定不再加** | 保持现状；表行数 = 实际步数（≠ 预判 N） |

模板（step-1 创建时写）：

```markdown
## Demo 子节进度

| 状态 | 子节 | 入口 | 端口 | 本子节教学点 |
|------|------|------|------|--------------|
| 🔄 | step-1 | `yarn app:05-01-...-step-1` | `50017` | tool_call 协议结构（1 函数 mock） |
```

后续每加一步 append 一行；不加的步骤不进表。

##### 过关检查

- **锁定时**：§5.3.2 6 项齐 + `node scripts/check-demo.cjs apps/{模块文件夹}/{小节文件夹}-step-N` 过 + 学习者主动决定锁
- `coach complete` 勾本条前：MD 已沉淀 + **至少 1 个 step-N 锁定（✅）** + 学习者说「我懂了」
- **不要求**所有未来 `step-(N+1)` 完成，因为 N 是动态的
- 已 ✅ 的小节**可以**继续加 `step-(N+1)`（加深场景）；新加的 step 走相同过关检查
- 已 ✅ 的旧 demo（不是新模型产生的）**不**回头拆

##### 什么时候不拆

- 本条「本条要能讲清」只有一件事
- 教学点天然分不开
- 本条 ≤ 1 个端口 / ≤ 1 个页面

**`coach complete` 过关检查补一句**：本条可运行时，`apps/{模块文件夹}/` 下至少要有 1 个 `{小节文件夹}-step-{N}/` **已锁定（✅）+ check-demo 过**。未锁定的 step-N 不算完成。**这解决「demo 完整度」过关检查；目标↔代码整合还须过 §5.4**（目标→代码覆盖 / 文档→代码对齐两段）。

#### 5.3.15 验证服务生命周期（起完必须关）

2026-09-03 维护模式起生效。

**问题**：agent 落 / 改完可运行 Demo 经常顺手起服务做 verify（`preview_start` / `Bash yarn app:…&`），verify 完忘了关，端口占着——下次学习者回来开 `yarn app:...` 直接撞口 / `EADDRINUSE`；Demo 一多互相影响。

**规则**：

| | 怎么做 |
| -- | ------ |
| **要不要起** | agent 自己判断——本条改动影响运行时（HTTP 行为 / 页面渲染 / 流式响应 / 端口冲突），启了看得清就启；纯类型 / 静态检查 / 文件 Read 就够的**不启** |
| **启了之后** | 完成 verify（`node scripts/check-demo.cjs` 过 + 至少一次 snapshot 或 fetch）→ **立刻关**：`preview_stop` / `TaskStop` / 杀进程；**不留**长跑 |
| **学习者要自己玩** | `cd apps && yarn app:...` 启动；agent 告诉学习者入口和端口即可，**不替学习者长跑** |
| **禁止** | verify 完留着 server 不关 / 没事先启一遍"以防万一" / 用 Bash `yarn ... &` 绕开 `preview_*` / 多个 Demo 同进程抢口不报 |

**理由**：端口是全仓库共享资源（占用表见 [apps/README.md](../apps/README.md)）；Demo 一多就互相撞口；学习者下次回来发现端口被占还得自己 `lsof -i :PORT` 找进程。学习模式不替学习者持有长跑服务。

#### 5.3.16 详细日志（强制）

**目的**：日志是**给人事后读的讲稿**，不是给程序解析的事件流。控制台看不清大量日志 / 没时间戳 / 电脑卡顿 → 服务端写文件。几个月后只翻 `logs/` 也要把这次运行讲完：**每一步发生了什么、带什么进去、出来什么、字段是什么意思**。

**生效范围（2026-09-07）**：本条闭环 / 人话规则对**此后新落或新改的 Demo / 新 step** 强制。**已锁定的旧 Demo 默认不改**（除非学习者明确说要）。本地 freeze 副本不随顶层改动。

**路径**
- 服务端日志文件：`apps/{demo}/logs/{YYYY-MM-DD}.log`（**按 BJT 日切**，demo 自管，删 demo 一起带走；同一天多进程共享同一文件，`appendFileSync` 原子追加即可）
- 前端：**不写日志**——页面已展示请求参数 / 调用流程 / 响应结果（§5.3.10 / §5.3.11 / §5.3.2 #4），不再重复打 #log 区

**`server.start` 标准（强制 · 2026-09-09 加）**

`app.listen(PORT, "127.0.0.1", () => { ... })` 回调里的**第一件事**必须是 `logger.info("server.start", ...)`，把这一版 Demo 的启动信息写进日志文件。控制台 / `yarn app:` 那一行横幅不能替代 —— **事后回看日志只能靠文件**，终端早关了。

```ts
app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-N 教学要点一句话", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",   // "B" | "A+B" | "mock" | "local"
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
```

**约定（缺一不可）**：
- `scope="server.start"` —— **锁死**；禁止 `server.startup` / `server.boot` / `server.init` 等变体（grep 必须只命中一种）
- `msg="listening"` —— **锁死**；禁止写完整 banner 文本当 msg（那是 console 的活）
- `explain` —— 一句话说清这版 Demo 教什么（事后回看日志一眼知道当时跑的是哪一版）
- `data.url` —— `http://127.0.0.1:${PORT}/`
- `data.protocol` —— `"A"` / `"B"` / `"A+B"`（真调 LLM）/ `"mock"`（不调 LLM 但走协议形状，如 step-1~5 mock 跑 tool_call 流程）/ `"local"`（纯本地计算，如 Token / Embedding / JSON Schema 校验）
- **不写 `data.endpoints`** —— 端点清单由 `routes/*.ts` 自己说话（`grep router.get` 一眼拿到），日志里塞一份会和 routes 漂移（route 改了忘改日志）
- `console.log` 留**一行** `浏览器: http://...` —— 给当前终端肉眼对端口，不写文件

**禁止**：
- 只写 `console.log(`http://...`);`，**没有** `logger.info` —— 终端看得到但日志文件里没有这版服务的任何痕迹
- `logger.info` 之后再 `console.log` 同一行 URL 两遍
- 用 `server.startup` / `server.boot` / `server.init` / `模块 ... 已启动` 当 scope —— 不锁死 = 日志 grep "server.start" 命中不全
- data 里塞 `port` / `bind` / `provider` / `model` / `hasKey` / `callsModel` 等冗余键 —— `url` 已含端口；`/health` 端点已暴露 provider / model / hasKey；不调 LLM 时 `protocol: "local"` 已说明
- data 里塞 `endpoints` —— 路由清单归 `routes/*.ts`，日志塞一份 = 双源真理、必漂移

**为什么必写文件**：`listen` 回调里的 `logger.info` 触发那一刻 = `appendFileSync` 写一行进 `logs/{YYYY-MM-DD}.log`。控制台窗口可能已关、进程可能已退出，**日志文件是事后唯一能回看「那一次启动暴露了哪些端点、走哪个协议」的来源**。如果只 `console.log` 不写文件，调试「线上为啥没看到这条端点」时根本无从查起。

**为什么 data 不塞 endpoints**：路由清单的真实源是 `routes/*.ts` 里 `router.get(...)` / `router.post(...)`；日志里再写一份就是双源真理 —— 加 endpoint 时改 routes 忘了改日志，或反过来，都让"看日志查端点"这件事不可靠。`grep -rE 'router\.(get|post)' apps/{demo}/routes/` 一眼拿到当前清单，何必复制到日志里。

**烟雾测试串联**（落完 / 改完 demo 当下必走）：起服务 → 立刻 `ls -lh apps/{demo}/logs/$(date +%Y-%m-%d).log` → 文件存在 + size > 0 = 这一行 `server.start` 写进去了。详下方「烟雾测试」段。

---

**写法模板（强制 · 2026-09-09 加）**

`createLogger(logDir)` 接收路径字符串。从 `lib/logger.ts` 写到 `apps/{demo}/logs/`，**必须**显式相对 `lib/logger.ts` 自己位置 → 再跳到 demo 根目录：

```ts
// logger.ts 顶部（拷 createLogger 函数体时一起加这两行）
import path from "node:path";
import { fileURLToPath } from "node:url";

// logger.ts 底部（替换原来 demo 自己写的 `export const logger = ...`）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const logger = createLogger(path.resolve(__dirname, "..", "logs"));
```

**约定**：写到 `lib/logger.ts` → 永远 `".."`；写到 `lib/tools/logger.ts` → 永远 `"../.."`；以此类推。**唯一合法写法**：`path.resolve(__dirname, "<n 层 ..>", "logs")` 配合上面两行 import。

**禁止**的写法（实测踩坑 · 2026-09-09 模块 06 · 01）：

```ts
// ❌ 错：import.meta.url 在 lib/logger.ts 里 → 解出来是 lib/logs/（不在 demo 根目录下）
export const logger = createLogger(new URL("./logs/", import.meta.url).pathname);

// ❌ 错：path.resolve 不能把 ".." 拼到字符串里（"..logs" 是合法路径名，不是父目录）
export const logger = createLogger(path.resolve(__dirname, "..logs"));
```

`mkdirSync({recursive:true})` 在这两种错法下都"成功"建出错的目录；`appendFileSync` 在 try/catch 里静默吞失败 → console 输出一切正常但 `apps/{demo}/logs/` 下没文件 / 文件在错位置。**单元测试跑不出来，必须起服务实测**。

**烟雾测试（强制 · 落 demo 当下必走）**

落完 / 改完 demo 当下：**起服务 → 看 logs/ → 关服务**。`console.log` 不能代替文件写入 —— `appendFileSync` 在 `try/catch` 里静默吞失败，console 一切正常但 `logs/` 下没文件。

**最简三步（实测 · 2026-09-09 模块 06 · 01 · 学习者修正）**：

服务起的**那一刻**（listen 回调里的 `logger.info("server.start", ...)`）就已经写日志了——`server.ts` import logger 时 mkdir，listen 回调 emit 时 write。**不需要 curl 触发、不需要 mtime 验证**。看到 logs/ 文件夹在 + 当天 .log 文件在 + 文件大小 > 0 = 路径 100% 正确。

```bash
cd /Users/i2025/Desktop/ai-agents-learning/apps && \
  PORT=31001 npx tsx {demo-path}/server.ts > /tmp/srv-{demo}.log 2>&1 &
SERVER_PID=$!
sleep 4

# 唯一检查：文件 + 大小
ls -lh apps/{demo}/logs/$(date +%Y-%m-%d).log          # 文件存在 + size > 0 = 路径 OK

kill $SERVER_PID
```

**全过** = 路径 OK。`apps/{demo}/logs/{YYYY-MM-DD}.log` 在 + 大小 > 0 字节。**不过** → 立刻回去修 `lib/logger.ts` 路径，**不要**推到 `coach complete`。

---

**为什么不用 `yarn app:xx` / 不用 `preview_start`**：

| | `yarn app:xx` | `preview_start` | `PORT=31001 npx tsx` |
|---|---|---|---|
| 默认端口 | inline `PORT=50038`（占学习者默认口） | 强制 50038 | 用 31001 临时覆盖 |
| cwd | 假设 apps/ | launch.json 自动 | 必须显式 cd |
| 跟学习者冲突 | **会** | **会** | **不会**（3 开头约定） |

烟雾测试专用端口约定：**31000~31999**。学习者跑 demo 用 50000+；agent 烟雾测试用 31001+。两条线**永不撞**。

**Bash 命令第一条必须是 `cd /.../apps`**（实测 8 次漏掉 · 2026-09-09 模块 06 · 01）：

```bash
# ❌ 错（仓库根 cwd，npx tsx 找不到 .ts，ERR_MODULE_NOT_FOUND）
date "+before=%H:%M:%S" && pkill ... && PORT=31001 npx tsx 06-.../server.ts

# ✅ 对（第一条就是 cd apps；cd 之后所有 && 都跑在 apps/ 下）
cd /Users/i2025/Desktop/ai-agents-learning/apps && date "+before=%H:%M:%S" && pkill ... && PORT=31001 npx tsx 06-.../server.ts
```

每条 Bash 命令 cwd 都从仓库根重置，**不写 cd = 必失败**。

**Agent 自检硬约束**（写 Bash 烟雾测试时）：每条命令第一个 token **必须是 `cd`**（cd 到 apps），否则后续 npx tsx / yarn 必失败。**或**用绝对路径兜底：

```bash
# 兜底方案 1：绝对路径 + --prefix（绕开 cd；agent 写命令时若跳过 cd 用这条保服务不崩）
PORT=31001 npx --prefix /Users/i2025/Desktop/ai-agents-learning/apps \
  tsx /Users/i2025/Desktop/ai-agents-learning/apps/06-.../server.ts > /tmp/srv.log 2>&1 &
```

**首选 `cd apps &&`**（约定优于兜底）；**只在 agent 写命令时漏 cd 才用绝对路径兜底**。

---

**之前 4 步全错的过度设计（已删 · 2026-09-09 学习者修正）**：

之前写的「curl /health + 触发业务端点 + mtime + grep + 端口释放校验」全删 ——。那些是给"服务起不写日志"准备的，但**服务起那一刻已经在写日志**，curl/mtime/grep 是多余步骤还引入新坑（grep 拿到旧 entry）。**学习者原话**：「你使用 3 开头的端口启动完之后，在 demo 的根目录就会有个 logs 文件夹，因为在写服务的时候它自己也会把日志打进去。不用像现在这样搞这么复杂。」

**顶层只是模板（禁止 Demo 运行时引用）**
- `apps/logger.ts` 导出 `createLogger(logDir)`——**仅作拷贝源**（内置安全序列化；处理 Error / Map / Set / Date / Buffer / 循环引用；**禁止**字节/深度截断）
- **硬规则（锁定 / 未锁定一视同仁）**：每一个 Demo、每一个 step，**落代码当下就必须完整拷贝**本地 `lib/logger.ts`。**不论**该 step 是否已锁定、是否还在打磨——**一律禁止**运行时 `import apps/logger.ts` / `createLogger` 委托顶层
- **每一条 Demo / 每一个新 step 落代码当下**：把当时顶层 `apps/logger.ts` **完整拷**到 `apps/{demo}/lib/logger.ts`，底部再 `export const logger = createLogger(.../logs)`；业务只 `import { logger } from "./logger"`
- **禁止**：`import { createLogger } from "../../../logger.js"`（或任何路径）委托顶层；禁止「未锁定先薄包一层、锁定再 freeze」——从第一行业务代码起就不能依赖共享实现
- 理由：顶层会改；共享引用会让旧 Demo 被未来改动连坐；条与条要能单独删

**本地 freeze（落 Demo 当下；与「锁定 step」无关）**
- 「锁定 step」= 教学点冻结；「拷贝 logger」= **落代码就做**，两者无关。未锁定工作区也必须是完整本地副本
- 顶部 doc comment 写「本地 freeze 副本 · 拷自顶层 YYYY-MM-DD」
- 顶层 `apps/logger.ts` 未来改动：只影响**之后新拷**的 demo / step；已有本地副本**一律不动**（已锁定的旧 Demo 默认不改，除非你明确说要）
- 业务代码（registry / chat / server 等）只认本 demo 的 `lib/logger.ts`，**不感知顶层**
- `node scripts/check-demo.cjs` **会拦**：缺 `lib/logger.ts` / 薄包装委托顶层 / 缺 `formatDataJson`（compact 一行）/ emit 未加空行 → FAIL；跨文件 `import apps/logger` 也 FAIL（已从 §5.3.12 共享白名单剔除）

**API（业务代码视角，四参调用极简）**

```ts
logger.debug(scope: string, msg: string, explain: string, data?: unknown)
logger.info (scope: string, msg: string, explain: string, data?: unknown)
logger.warn (scope: string, msg: string, explain: string, data?: unknown)
logger.error(scope: string, msg: string, explain: string, data?: unknown)
```

**约定（业务代码写法）**
- `scope`：**中文 + 用 `│` 标谁套在谁里面**。入口（handler）无竖线；每套一层加一根 `│`（后面有空格）：`│ 调用函数-callLlmOnce`、`││ 调用模型-对话补全`。不要靠「看时间猜谁包着谁」。
- `msg`：**调用类型 + 开始/结束 + 名字**。四种前缀，禁止只写「xxx开始 / xxx结束」：
  - 业务函数 / 工具 / **封装**（`callLlmOnce` 等）：`调用函数开始：callLlmOnce`
  - **真发网络请求的模型调用**：`调用模型开始：对话补全`
  - **真发网络请求的 HTTP**（自己 fetch、不是 SDK 那次）：`调用HTTP开始：GET https://…`
  - Agent / for 循环每一圈：`调用循环开始：第 1 轮 / 共 8 轮`（无限循环写已跑圈数）
  - 失败：同一句式加 `（失败）`，如 `调用函数结束：queryStock（失败）`
- `explain`：**人话，必填**。① **为什么写这条日志**（= 为什么要调这个）② **当前到哪一步**。禁止「方便排错」「记录一下」
- **真发网络请求 vs 外面再包一层函数（禁止两次都叫「调用模型」）**：SDK / fetch 那一次才写「调用模型」或「调用HTTP」。外面的 `callLlmOnce` / `handleChat` 写「调用函数」，`explain` 写明「里面那次才是真发网络请求」。两套五条日志都可以留，类型不要重名。
- **文件里不写服务名**；**密钥打码**

**每条格式**
- **每条记录前空一行**；**msg / explain / data 三块之间也空一行**（`emit` 自动加，业务代码不要自己再空）
- 服务端文件：空行 + 时间头单行 `YYYY-MM-DD HH:MM:SS.mmm +08:00 <LEVEL> <scope>` + 空行 + `  msg=…` + 空行 + `  explain=…` + 空行 + data（北京时）
- data **下一行起** indent-2 多行 JSON。**有 `__code` 时其余字段同样多行**，禁止 compact 一行
- **`data.__code`**：每次调用必带（工具也要）；打在「开始」条；结束条不必重复源码
- **LLM / HTTP 响应写整个对象**；`字段释义` = 只解释本条课用到的返回字段（如 `finish_reason` / `tool_calls` / `usage`），不要给 SDK 每个键做词典
- `data` 建议键：`入参` / `返回值` / `字段释义` / `耗时ms` / `第几轮` / `本轮为什么是这些参数`

**入参 / 返回值必须原样完整 · 文件日志禁止截断（强制 · 2026-09-09 加 · 实测踩坑）**

五条日志里的 **`data.入参` 和 `data.返回值`**，对**每一次**调用（调用函数 / 调用模型 / 调用HTTP / 工具）都 = **实际传入的参数原文** + **实际返回的对象原文**，不论多长都要写进 `logs/`。事后只翻日志必须能复盘「当时带了什么进去、出来了什么」。

| 可以 | 禁止（任何调用的 `入参` / `返回值`） |
| ---- | ---------------------------------- |
| `{ 入参: request }` / `{ 入参: { messages, tools, … } }` —— `messages` 等是完整数组/对象全文 | 只打 `messagesLen` / `messagesCount` / `tokensEstimate` / `*Preview` / `*Len` / `content.slice(0, N)` 当「入参」或「返回值」 |
| `{ 返回值: response }` —— 完整对象（模型/HTTP 打整包） | 用长度 / 预览 / 摘要冒充；「太长了先省略，页面上能看」也不行 |
| 额外键（`tokensEstimate` / `stage` / `字段释义`）可**并存**，但不能**代替**正文 | 外面再包一层的函数用摘要、指望内层才写全文——**外层也要全文** |
| 密钥仍打码（`sk-***`） | 以「怕日志大」为由砍正文 |

**反例（实测 · 2026-09-09 模块 06 · 02 step-1）**：`调用模型开始：对比补全` 的 `入参` 只写了 `{ stage, messagesLen: 102, tokensEstimate, modelA }` —— 翻日志讲不清滑动窗口前后模型到底吃了哪些轮。**正例**：`入参` 里带完整 `messages: [{role, content}, …]`（before / after 各打一份原文）。

**文件 logger 硬规则（顶层 `apps/logger.ts` 模板 · 2026-09-09 起）**：
- **禁止** `MAX_BYTES` / `…truncated` 按字节砍文件内容
- **禁止** `MAX_DEPTH` 把深层对象收成 `[…]` / `{…}`
- 仅循环引用写成 `"[Circular]"`（否则序列化会炸）；其余原样
- 新落 / 新改 Demo：从顶层**完整重拷** `lib/logger.ts`（旧锁定副本默认不改，除非你明确说要）

**内置序列化（data 不能崩 · 不截断）**

| 类型 | 怎么显示 |
| ---- | -------- |
| `Error` | `{ name, message, stack, ...自定义字段 }` |
| `Map` | 转对象；`Set` 转数组 |
| `Date` | ISO string |
| `Buffer` | `{ type: "Buffer", length, hex }`（**完整** hex，不 preview） |
| `undefined` / `null` | 字面量字符串 |
| 循环引用 | `"[Circular]"` |
| 函数 | `"[Function: name]"` |
| 大对象 | **不截断**，原样写进文件 |

**业务代码写日志原则（详细优先）**
- **不怕多**：函数里每一段能单独说清的步骤都打；不要「跑完才打一条汇总」
- 与 [§5.3.11 `// ①②③` 注解](../AGENTS.md#53-小节-Demo-完整版前后端--react--koa2026-09-02-维护模式起生效) 对齐：在该行附近插 `logger.info(...)`
- `debug` 调试细节；`info` 主流程节点；`warn` 异常但可走通；`error` 失败（**仍要打「结束」**）
- **不**因为怕啰嗦省略

**闭环：每次调用只打这五条日志（缺一头 = 没打完）**

一次「调用」= 业务函数 / 方法 / 工具 / 调模型 / 调外部 HTTP。循环见下一节（句式是「调用循环」）。

| 顺序 | 所有调用都要？ | 打什么 |
| ---- | -------------- | ------ |
| 1 开始 | 要 | `msg` 见四种前缀的「开始」。`explain`：为什么写这条日志， 走到哪 |
| 2 入参 | 要 | **原样完整参数**（见上节）。可和「开始」写在同一条。禁止 Len/Count/Preview 冒充 |
| 3 源代码 | 要（**工具也要**） | `__code` |
| 4 返回值 | 要 | 写在「结束」条。**原样完整对象**（模型/HTTP/函数一律打整包，禁止摘要） |
| 5 结束 | 要 | 「结束」句式；`data.耗时ms`（从本调用开始到现在）；失败用 `error` + `（失败）` + 错误对象当返回值 |

**禁止**「发出 / 已交给提供商 / 接到」中间态。

嵌套：外层开始之后、外层结束之前插入内层五条日志；内层 `scope` 多一根 `│`。

**流式（SSE / stream）**：只打**一次**「调用模型开始」；中间 token/chunk **不要**套五条日志（最多 `debug` 一句「又来了一块」）；「调用模型结束」打**拼好的完整返回值**（和最终给页面的那份一致）+ `耗时ms`。

**两档详细度（五条日志永远不省）**

| 档 | 哪些 | 五条日志之外再打什么 |
| -- | ---- | ------------------ |
| **主路径详细写** | 真发网络请求的模型/HTTP；本条主路径；知识点封装函数 | 函数体逐步（子调用各自五条日志）；返回值上加**教学相关** `字段释义` |
| **普通函数简写** | 普通工具 / helper | 函数体**一句**；五条日志（含 `__code`）仍要 |

**主路径详细写示例（真发网络请求；封装在外层用「调用函数」）**

```ts
// ✅ 入参 / 返回值都是完整对象；禁止 messagesCount / messagesLen / Preview
logger.info(
  "││ 调用模型-对话补全",
  "调用模型开始：对话补全",
  "为什么写这条日志：这是真发网络请求的那一次，不用它就没有 tool_calls。当前：在 callLlmOnce 里面，第 1 轮，messages 还没有 tool 结果。",
  { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
);
// ❌ 禁止：{ 入参: { messagesLen: 102, tokensEstimate: 3038, modelA: "…" } }
const t0 = Date.now();
const response = await llm.openai.chat.completions.create(request);
logger.info(
  "││ 调用模型-对话补全",
  "调用模型结束：对话补全",
  "为什么写这条日志：要用 finish_reason 决定下一步。当前：await 已返回；下一步按 tool_calls 调 queryStock。",
  { 返回值: response, 耗时ms: Date.now() - t0, 字段释义: { "choices[0].finish_reason": "tool_calls = 要调工具", "choices[0].message.tool_calls": "要执行的函数名和参数" } },
);
```

封装不要写成「调用模型」（类型前缀仍区分；**入参/返回值照样全文，不许摘要**）：

```ts
logger.info(
  "│ 调用函数-callLlmOnce",
  "调用函数开始：callLlmOnce",
  "为什么写这条日志：路由只认这一层返回值。里面那次才是真发网络请求（看「调用模型开始：对话补全」）。当前：Round-1 即将问模型。",
  { 入参: { messages, tools }, __code: "const out = await callLlmOnce(messages, tools);" },
);
```

**普通函数简写示例**

```ts
logger.info(
  "││ 调用函数-queryStock",
  "调用函数开始：queryStock",
  "为什么写这条日志：模型已经明确说要这个工具，不查库存就进不了第 2 轮。当前：第 1 轮 sku=SKU-88。",
  { 入参: { sku: "SKU-88" }, __code: "const 返回值 = queryStock(\"SKU-88\");" },
);
const t0 = Date.now();
const 返回值 = queryStock("SKU-88");
logger.info(
  "││ 调用函数-queryStock",
  "调用函数结束：queryStock",
  "为什么写这条日志：要把件数交回给模型。当前：available=12，下一步 role=tool。",
  { 返回值, 耗时ms: Date.now() - t0 },
);
```

**循环：每一圈都写完整（不准抽样）**

句式用「调用循环」，不要写成「第 1 轮开始」。每一圈：

1. `调用循环开始：第 1 轮 / 共 8 轮`（`scope` 如 `│ 调用循环`）
2. 本轮参数 + **为什么是这些参数**
3. 圈里的子调用走五条日志（`│` 多一根）
4. `调用循环结束：第 1 轮` + 本轮结果 + `耗时ms`

禁止只打「进入循环」「循环结束」。圈数多也每圈都写完整。

**自查（落完 Demo 翻一遍日志，任一条「否」= 没打完）**

- 相邻两条之间是否有空行？
- `scope` 能否看出嵌套（`│` 层数）？封装是否误写成「调用模型」？
- `msg` 是否是四种前缀之一 + 开始/结束？失败是否带 `（失败）`？结束是否有 `耗时ms`？
- `explain` 是否有「为什么写这条日志」和「当前到哪」？
- 五条日志是否齐？工具是否有 `__code`？有没有「发出/接到」？
- **每一次调用的 `入参` / `返回值` 是否原样完整**？有没有偷换成 Len/Count/Preview？`lib/logger.ts` 有没有 `MAX_BYTES` / `…truncated` / `MAX_DEPTH`？
- 循环是否「调用循环」+ 每一圈都写完整？流式是否只在结束写完整拼好结果？
- `字段释义` 是否只覆盖本条教学字段（完整对象仍在 `返回值`）？

### 5.3.17 持久化存储（`lib/db.ts` + `data/`，DB 抽象 + 数据目录分离）·新

2026-09-09 起生效。**任何有持久化需求的 demo 必须按本节约定**——禁止业务代码直接读写 `data/`；`lib/db.ts` 是唯一对外触点；**默认实现 = SQLite**（`better-sqlite3`，同步 API + 包 async）。**理由**：① 接口是**通用 KV 抽象**（`kvGet / kvSet / kvDel / kvList`），跟业务语义（Memory / Fact / State / Cache）正交——同一份 `lib/db.ts` 可被任意业务复用；② 接口签名不变 → 未来换驱动（同步 → 异步如 `node:sqlite` / `libsql`）、加表 / 加字段 / 加缓存层 / 加向量索引，业务代码全部零改动，只动 `lib/db.ts` 一个文件；③ 文件名 / 表名 / 内部 key 命名按 demo 业务起，不在本节钉死——后续 demo 自己改。

#### 1. 强制结构

```
apps/{demo}/
├── lib/db.ts          ← 唯一对外接口；通用 KV 抽象（不绑业务）；签名不变
├── data/              ← 持久化数据目录
│   ├── .gitkeep       ← 空目录占位（demo 一行数据都没有时仓库也能保留目录）
│   └── *.db           ← SQLite 数据库文件；文件名按 demo 业务起（见 §3 #3）
└── routes/*.ts        ← 业务；只能调 lib/db.ts；禁止直接读 data/
```

**核心约定**：`lib/db.ts` 是**唯一触点**——业务不直接读 `data/`，不直接 `new Database`。换驱动、加新表 / 字段、加缓存层 = 改这一个文件，routes / chat.ts 不动。**接口层是通用 KV 抽象，不绑业务语义**——`kvGet / kvSet / kvDel / kvList` 跟 "Memory / Fact / State / Cache" 是正交的两件事；业务名归业务层（routes/*.ts）起。

#### 2. 强制接口（通用 KV 抽象；签名不变）

```ts
// apps/{demo}/lib/db.ts —— 任何实现都必须 export 这 4 个函数
// 函数名 = KV 操作语义（不绑业务；不叫 getMemory / setMemory）
export async function kvGet(userId: string, key: string): Promise<unknown>
export async function kvSet(userId: string, key: string, value: unknown): Promise<void>
export async function kvDel(userId: string, key: string): Promise<void>
export async function kvList(userId: string): Promise<Record<string, unknown>>
```

**接口语义（缺一不可，业务代码据此判断）**：

| 函数 | 不存在 | 重复 | 失败 |
| --- | --- | --- | --- |
| `kvGet` | 返回 `undefined` | — | `throw Error` |
| `kvSet` | 自动创建 user | 整体覆盖（同 key） | `throw Error` |
| `kvDel` | `no-op`（不抛错） | — | `throw Error` |
| `kvList` | 返回 `{}` | — | `throw Error` |

**`userId` 是接口第一个参数**——多用户 demo 强制传；单用户 demo 也写 `userId = "default"`，未来扩展不动签名。**禁止**接口层做全局共享 KV（多租户灾难，对照模块 06 · 01 易混点 / 踩坑 3）。

**接口名 = KV 抽象层，不绑业务**：业务层（routes/memory.ts / routes/state.ts / routes/cache.ts）按业务起名；接口层永远 `kvGet / kvSet / kvDel / kvList`。换 demo = 换 routes 文件名 + 换 data 文件名 + 换内部 key 命名；接口不变。

#### 3. 强制约定清单

| # | 约定 | 防什么 |
| --- | --- | --- |
| 1 | `lib/db.ts` 是唯一触点；业务不直接读 `data/` | 未来换驱动时全文件搜 `fs.readFileSync("data/` 或 `new Database("data/`) 绕过 |
| 2 | 路径写法：`const DB_FILE = path.resolve(__dirname, "..", "data", "{demo-业务}.db")`（跟 §5.3.16 logger 同款） | `import.meta.url` 的相对 trick 把 data/ 落到错位置 |
| 3 | 文件名按 **demo 业务** 起（不统一；模块 06 偏好 → `preferences.db`，模块 07 事实 → `facts.db`，业务名归业务层定）—— 接口层 KV 抽象，**不绑**文件语义 | 文件名钉死到具体业务（如统一叫 `memory.db`）→ 后续非 Memory 类 demo 改名反而别扭 |
| 4 | `data/` 默认进 git（沿用本仓库 logs/ 惯例）；同时放 `.gitkeep` 保空目录 | 学习者 clone 后看到空状态困惑；首跑前目录不存在 |
| 5 | data 目录**禁止写日志**（log 走 `logs/`，跟 data 分开） | 调试时 grep 命中数据当日志 |
| 6 | SQLite 写用 **transaction 包裹** + 启动时 `PRAGMA synchronous = FULL`（better-sqlite3 默认 = FULL，**禁止**改成 NORMAL/OFF 提速） | 多请求并发半截写坏文件；`synchronous=OFF` 在断电 / 崩溃时丢数据 |
| 7 | SQLite 启动时跑 **`PRAGMA integrity_check`**；不通过时复制 `{demo-业务}.db.bak` + 重建空表 + `throw Error` | 静默吞错导致下游崩在不懂的位置 |
| 8 | 接口统一 `async`（better-sqlite3 同步 API 也用 `Promise.resolve(...).then(...)` 包 async；或 `await new Promise(...)` 转换） | 未来换异步驱动（node:sqlite / libsql）签名一致 |
| 9 | `updated_at` 字段保留（schema 演进时方便回溯）；具体写在哪一级（user / key）由 demo 业务决定，不在本节钉死 | 接口被业务自由改 = 接口不稳 |
| 10 | tsdoc 模板：与 §5.3.16 logger.ts 同款——**职责 / 数据流 / 为什么单独成文件** | 文件头不留「为什么」= 未来改不动 |
| 11 | `lib/db.ts` 文件头注「DB 实现：默认 better-sqlite3；签名不变 → 未来换驱动零改动」 | 提示未来维护者这是抽象层，不是 SQLite 专属 |

#### 4. SQLite schema + 实现骨架（参考；具体字段 / 业务命名由 demo 业务定）

**schema（最小集；demo 业务需要的字段加在 `value` JSON 里即可，不必动表）**

```sql
CREATE TABLE IF NOT EXISTS kv (
  user_id    TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  value      TEXT    NOT NULL,    -- JSON.stringify；业务传啥存啥
  updated_at TEXT    NOT NULL,    -- ISO 8601
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_kv_user ON kv(user_id);
```

**业务级 schema / 命名约定由 demo 自己起**——比如 "`language` / `no_marketing` / `last_complaint`" 这种业务键、`value` 内部 JSON 结构、表名要不要分多张（多业务共存时），**都不在本节钉死**；落 demo 时按业务写。

**实现骨架（最小；demo 可按需扩展）**

```ts
// apps/{demo}/lib/db.ts
// 职责：通用 KV 抽象层；DB 默认实现 = better-sqlite3；签名不变 → 换驱动业务零改动
// 数据流：routes/*.ts → kvGet/kvSet/kvDel/kvList → data/{demo-业务}.db

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
// 文件名按 demo 业务起（模块 06 偏好 = preferences.db；模块 07 事实 = facts.db …）
const DB_FILE = path.resolve(DATA_DIR, "{demo-业务}.db");

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");   // §3 #6：禁止改 NORMAL/OFF
db.exec(`CREATE TABLE IF NOT EXISTS kv (...)`);  // schema 见上

// §3 #7：启动 integrity_check
const integrity = db.pragma("integrity_check");
if (integrity[0]?.integrity_check !== "ok") { /* 备份 .bak + throw */ }

const stmtGet    = db.prepare("SELECT value FROM kv WHERE user_id = ? AND key = ?");
const stmtUpsert = db.prepare("INSERT INTO kv ... ON CONFLICT ... DO UPDATE SET ...");
const stmtDelete = db.prepare("DELETE FROM kv WHERE user_id = ? AND key = ?");
const stmtList   = db.prepare("SELECT key, value FROM kv WHERE user_id = ?");

export async function kvGet(userId: string, key: string): Promise<unknown> { /* ... */ }
export async function kvSet(userId: string, key: string, value: unknown): Promise<void> { /* ... */ }
export async function kvDel(userId: string, key: string): Promise<void> { /* ... */ }
export async function kvList(userId: string): Promise<Record<string, unknown>> { /* ... */ }
```

**依赖**：`apps/package.json` 加 `"better-sqlite3": "^11"`；`yarn install` 一次，所有 demo 复用。

#### 5. check-demo 加规则

```text
- 持久化类 demo（有 lib/db.ts 的）：缺 lib/db.ts → FAIL
- 持久化类 demo：缺 data/.gitkeep → FAIL（空目录进 git）
- 持久化类 demo：data/*.db 默认进 git（跟 logs/ 同款；不在 .gitignore）
- 业务代码 import "\.+/data/..." → FAIL（绕过 db.ts 直接 import）
- 业务代码（lib/db.ts 之外）出现 new Database\(".*data/ → FAIL（绕过 db.ts 直接开 DB）
- 业务代码（lib/db.ts 之外）出现 fs\.(read|write)FileSync.*data/ → FAIL（JSON 回退；SQLite 实现不允许）
- data/ 下出现 .json 文件 → FAIL（防有人回退到 JSON 实现）
```

#### 6. 不在本节范围（避免越界）

- 不规定**业务层** schema：业务 key 命名（`language` / `no_marketing` / `last_complaint` …）、`value` 内部 JSON 结构、多业务共存时分几张表 → 落 demo 时按业务定
- 不强制每个 demo 都有 `lib/db.ts`（无持久化 demo 不需要）
- 不规定 data/ 用 `.gitignore`（本仓库惯例进 git；学习者 clone 后看到种子数据是预期）

### 5.4 目标 ↔ 代码整合过关检查（先抽清单再逐项核对）·新

2026-09-04 维护模式起生效。

**问题**：旧过关检查（[§5.2](#52-小节-demo)「`coach complete` 过关检查」+ [§5.3.14](#5314-demo-子节拆分动态引导由浅入深新) 「过关检查」）只查「demo 跑通没 / §5.3.2 6 项齐没 / check-demo 过没 / 锁没锁」。**这些都只是「代码存在」**——但「代码存在」≠「本条要能讲清」。MD 写满了「含并行调用」+「Promise.all」，代码里却用同步 `.map(...)`，跑通 + 6 项齐 + check-demo 过 + 双 step 锁定，**过关检查全过、可勾 ✅**——可「并行调用」这个目标点根本**没在代码里真实跑过**，合上文件后还能自己讲出来讲不清「真实跑过的并行时序长什么样」。

**解决**——勾 ✅ 前再加一道过关检查，**先抽清单再逐项核对**，**两段都过**才能勾。任意一段不过 → 不准勾 ✅。

#### 5.4.A 目标 → 代码覆盖（正向）

**问题**：「本条要能讲清」拆出的每个目标点，**代码 / 页面里有可观察证据吗**？

**步骤**：

1. 读该行「本条要能讲清」原文（[模块 README 小节进度](AGENTS.md#31-当前小节锁定对话中途绝不换条)），**逐条**拆出「目标点」清单。一行一条，每条必须含**动词 + 可观察行为**（「能画出 X」「含 Y」「支持 Z」）。复述「本条要能讲清」原文不算拆。
2. 对每个目标点，在已锁定 step-N 的代码 + 页面里找证据——具体到 `step-N 文件路径 + 行号` / `按钮 / 卡片 / 输出区 id` / `接口响应字段`。找不到证据 = **缺口**。
3. 写「目标 ↔ 证据」表，状态 ✅(有证据) / ❌(缺口)。
4. **即便看着齐也要逐点扫**——主动找缺；不能「看着齐就放过」。

**示例**：模块 05 · 01 Function Calling 协议（实际跑出来 ❌）

| 目标点（拆自「能画出这一圈，**含并行调用**」） | 状态 | 证据 |
|---|---|---|
| A1 能画出 5 动作一圈（model → tool_call → execute → tool_result → final_reply） | 已实现 | step-1 五张卡片 (#card-input / #card-decide / #card-execute / #card-result / #card-final) + step-2 #llm-protocol 四张 Request/Response 卡 |
| A2 **含并行调用** | 未实现 | step-1 routes/chat.ts:85 `model_tool_calls.map(...)` 同步；registry.ts:50 `executeTool` 同步；handler 同步；grep 全模块 `Promise.all` 仅 0 处实际调用（4 处全在注释 / docstring / 前端文案） |

#### 5.4.B 文档 → 代码对齐（反向）

**问题**：MD 文档里**讲到的**每条机制 / 例子 / 踩坑 / 易混点，对应的**代码 / 行为在代码里真实存在吗**？

> **Demo 覆盖的本质（2026-09-05 维护模式起生效）**：**MD 各节（是什么 / 为什么 / 易混点 / 例子 / 踩坑 / 需求清单）→ 代码里**逐条**找证据（文件:行号 / 按钮 id / 接口字段）**。**禁止**只看 MD 文档里有的概念 —— **例子 / 踩坑 / 易混点**都必须映射到代码（哪怕是一个按钮 / 一行注释 / 一段对比 demo）。MD 写满 vs 代码只实现一部分 = **文档虚胖 = 缺口**。

**步骤**：

1. 通读小节 MD 的「是什么 / 为什么 / 易混点 / 例子 / 踩坑 / 需求清单 / 还没搞懂的 / 我追问过的」各节，**逐条**列出 MD 提到的**可被代码实现的具体行为**（机制点 / 例子场景 / 需求场景 / 踩坑演示 / 易混对比）。
   - **例子 / 踩坑 / 易混点**必须有对应代码（按钮 / 路由 / handler / 前端页 / 注释 / 对比 demo），**禁止**只写在 MD 里而代码里找不到映射。
   - **交互步骤必须保真**：MD 需求 / 例子写了「先预览再确认 / 分步向导 / 对照两侧」，代码必须能逐步点完；一个按钮代劳 = 缺口。对照必须每侧独立请求，禁止一个超级接口打包跑多轨迹。对照可以同页，但页面须拆组件。
   - **主流程单独成文件**：本步核心（Agent 循环 / 调大模型 / 规划器）须在 `lib/flow/` 一眼能打开的文件里；埋在 route 里 = 缺口。
   - 「还没搞懂的 / 我追问过的」节里若学习者点了"应去 X 模块学" → 不算本条缺口（属跨条依赖），但要标 "→ 模块 YY · ZZ"。
2. 对每一条，在已锁定 step-N 的代码 + 页面里找对应——具体到 `step-N 文件路径 + 行号` / `按钮 / 卡片`。找不到 = **缺口**（文档说太多 / 代码没实现）。
3. 写「文档讲点 ↔ 代码行为」表，状态 ✅(代码里能找到) / ❌(代码里没有)。
4. **反向扫一遍**——MD 比代码多 = 缺口。理由：「MD 写满 vs 代码只实现一部分 = 文档虚胖」，是最常见的「看着完整实则不完整」。

**示例**：模块 05 · 01 Function Calling 协议（实际跑出来 ❌）

| MD 讲点 | 代码里有没有 | 状态 |
|---|---|---|
| 「例子 4 · 前端：**并行**调用（旅游规划助手）—— 5 月东京 7 天要带什么、机票多少钱？」 | step-1 / step-2 都没有这个场景按钮；handler 同步；前端无并发时序图 | 未实现 |
| 「易混点：并行调用 ≠ SDK 自动；必须 `Promise.all`」 | 代码没用 `Promise.all` | 未实现 |
| 「踩坑：串行 `for await` 执行 → 模型嫌慢 → 编造结果」 | 同步 `.map`；没演示「串行 vs 并行」对比；前端无延迟对比 | 未实现 |
| 「易混点：OpenAI strict 模式不带 `additionalProperties:false` → 400」 | 代码没演示 strict 模式 | 未实现（MD 写了可观察行为就必须实现；不要标「不阻塞」） |

#### 过关检查逻辑（对应 [03-progress 过关检查 3](./03-progress.md#过关检查-3--54-独立代码覆盖验证抽清单--逐项核对)）

**写死的约定**：① MD 进过关检查 3 清单的项 → 代码必须**已实现**；② **状态栏只许「已实现 / 未实现」**（**禁止** `⚠` / `❌` / `✅` /「警告但阻塞」/「单向缺口不阻塞」/「❌ 但不阻塞」——旧表出现「❌ · 不阻塞」一律按**未实现**计）；③ 未实现 = 阻塞；缺口只许 **补代码** 或 **拆成两条进度**，**禁止**问「接受缺口写进 MD」；④ **抽清单 + 核对**都由独立 subagent **一次做完**（禁止教练自查后再派 subagent 复扫同一清单）。

```
coach complete：过关检查 1 → 2 → 3
过关检查 3 = 独立 subagent
  ├─ ① 从 MD 抽完整清单（§5.4.A + §5.4.B 拆法）
  ├─ ② 对每一项查代码证据
  ├─ 全部 已实现 → 可勾 ✅
  └─ 任一 未实现 → STOP
```
#### 触发时机

| 时机 | 必须写出？ |
|---|---|
| `coach status` | **不写**——status 只报进度 + 分流问句（[03-progress `coach status`](./03-progress.md#coach-status只报进度--一句分流)） |
| `coach start`（外部条） | **必须写出**——即便看着齐也主动扫一遍 |
| `coach complete`（外部条勾 ✅ 前） | **必须写出**——不过不准勾 |
| `沉淀文档`（增量更新某条 MD） | **必须写出**——增量更新后必须重跑 §5.4.B（文档改了，对齐可能破） |
| `模块复盘`（最后一行） | **不写**——[AGENTS.md §7.3](../AGENTS.md#73-模块复盘进度表最后一行) 只过 MD 过关检查，不查代码 |
| 已 ✅ 的旧条（不在当前条） | **不写**——除非学习者明确说要补漏 |

#### 输出模板（写到小节 MD 的「Demo 子节进度」表之后）

```markdown
## §5.4 目标 ↔ 代码整合过关检查

跑过关检查日期：YYYY-MM-DD

### §5.4.A 目标 → 代码覆盖

「本条要能讲清」：{原文}

| 目标点 | 状态 | 证据 |
|---|---|---|
| {动词 + 可观察行为} | 已实现 / 未实现 | {step-N 文件:行号 / 按钮 id / 接口字段} |

**A 段小结**：过 / 不过。未实现 N 条：{列每条缺什么、建议补在 step-N / step-(N+1)}。

### §5.4.B 文档 → 代码对齐

| MD 讲点 | 代码里有没有 | 状态 |
|---|---|---|
| {MD 原文一句话} | 已实现 / 未实现 | {step-N 文件:行号} |

**B 段小结**：过 / 不过。未实现 N 条：{列每条 MD 多讲的、代码没实现的}。
```

> **禁止**在状态栏写 `✅` / `❌` / `⚠` /「不阻塞」。未实现就是未实现，没有「标了却放过」。

#### 禁止

- 「代码存在」就放过关检查——必须逐点对证据
- 「看着齐就放过」——必须主动扫
- 把「目标点」写成「机制描述」（目标点 = 可观察行为，不是「过程定义」）
- 把「MD 讲点」当成「MD 章节标题」——必须是 MD 里**具体的一句机制 / 例子 / 踩坑**
- §5.4.A 未实现 = 「拒绝当前条 ✅」；不是「自动建 step-(N+1) 补」——补不补、怎么补由学习者在 **补代码 / 拆成两条进度** 里选（参 [§5.3.14 交互检查点协议](05-demo.md#交互检查点协议每步之间必走) + [03-progress 过关检查 3](./03-progress.md#过关检查-3--54-独立代码覆盖验证抽清单--逐项核对)）
- 用 `⚠` / `❌` / `✅`（过关检查状态栏）/「警告但阻塞」/「单向缺口不阻塞」/「❌ 但不阻塞」/「注释算已实现」敷衍过去
- 问「接受缺口写进 MD / 已知缺口节」
- 已 ✅ 的旧条默认不回头跑 §5.4 过关检查（除非学习者明确说要补漏）

#### 过关检查之间的分工

| 过关检查 | 解决什么 |
|---|---|
| **[过关检查 1 · §7.2](./03-progress.md#过关检查-1--72-md-知识覆盖)** | MD 是否沉完、能否讲清「本条要能讲清」 |
| **[过关检查 2 · §5.2](./03-progress.md#过关检查-2--52-demo-完整度)** | demo 是否存在 / 跑通 / §5.3.2 / check-demo / 已锁定 |
| **[过关检查 3 · §5.4 独立验证](./03-progress.md#过关检查-3--54-独立代码覆盖验证抽清单--逐项核对)** | 从 MD 抽清单 + 对代码逐项已实现（独立 subagent 一次做完；禁教练双扫） |
| **[§7.3](../AGENTS.md#73-模块复盘进度表最后一行)** | 模块复盘行专用，只过 MD 过关检查 |

> **Demo 覆盖 = 过关检查 3 过**（§5.4.A 正向 + §5.4.B 反向，同闸内由 subagent 抽清单并核对）。A 看「**目标点有没有**」，B 看「**MD 讲到的有没有**」。两层都不漏 = Demo 真正完整。
