# Demo 落点细则（§5.0 / §5.1 / §5.3）

> **不会自动注入。** Cursor / Codex / Claude Code 只自动读仓库根 [AGENTS.md](../AGENTS.md)。
> **何时必须 Read 本文件：** 判 Demo / 打判断块；结论是可运行时再读全文（落/改 HTML/koa、扩 CATALOG、拆多场景、协议 A/B）。根 [AGENTS.md §5.2](../AGENTS.md#52-小节-demo) 只留三结论摘要；判断块与闸门以本文件为准。

## 5. Demo 落点

`apps/` 是本仓库**唯一**的代码落点：模块 00 mini-app（HTTP）+ 每条外部小节的最小可运行 Demo。**模块复盘不落代码**（[§7.3](../AGENTS.md#73-模块复盘进度表最后一行)）。学完模块 23 后若要作品集，从零建独立项目。

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

判断结论在 `coach start` 结束就必须告诉学习者。默认未点名则沉淀后再落代码；**学习者说写就立刻写**（不等沉淀，禁止用「讲课当时」拒绝）。

| 时机 | 做什么 |
| ---- | ------ |
| `coach start` 详解结束 | 按下面标准判完，打出 [本条产出预告](./03-progress.md#61-本条产出预告)。用人话说清「要 / 不要写 Demo」。默认先不落 |
| 学习者说写 / 先落 Demo / 强制出 Demo | **立刻**按结论写满本条 Demo |
| 沉淀之后、`coach next` 勾 ✅ 之前 | 再打 **Demo 判断块**（未打不准勾）。与 start 预告一致则写「与 start 预告一致」；改判须一句原因。该落还没落则当场做 |

| 行类型 | Demo 判断 |
| ------ | --------- |
| 外部概念条 | **必须判断**（结论三选一：无 / 伪代码 / 可运行；**不是**每条都要可运行代码） |
| 「模块复盘」行 | **不打 Demo 判断块**。结论固定为「只写 MD」，按 [§7.3](../AGENTS.md#73-模块复盘进度表最后一行) 写 `{NN}-模块复盘.md`。禁止用「跳过判断 / 只写笔记 / 补缺口」交差 |

已 ✅ 的旧小节**不回头补** Demo，除非学习者点名。

判断由助手做，对照「本条要能讲清」。一眼能定（纯概念 → 无）就自己判；**两可 / 不好处理**走 [00-mode.md §0.3](./00-mode.md#03-不好处理时先给选项)。学习者可改判：「这次不要 Demo」/「强制出 Demo」。

#### 判断标准

先问：合上笔记，是否必须看见一次**可观察的运行结果**（或写清可照着敲的步骤），才能讲清「本条要能讲清」？

| 结论 | 何时 | 落哪 |
| ---- | ---- | ---- |
| **无** | 纯概念（定义、来源、对照）；跑起来没有新信息 | 小节 MD 写 `Demo：无` + 一句理由 |
| **伪代码** | 机制步骤必须写清，但不值得起进程（如 Attention 数据怎么走） | 写进该条小节 MD 的机制 / 例子，**不建** `apps/` 文件夹；MD 写 `Demo：伪代码（见机制）` |
| **可运行** | 必须看见一次可观察的运行结果才能讲清「本条要能讲清」（调 API、协议字段、本地 encode / Zod parse 都算） | **一律 §5.3**（`server.ts` + 页）。哪怕逻辑只有几行、不调 LLM，也要有按钮和 `#output`。MD 写 `Demo：已落 apps/…` |

禁止为凑而建空文件夹。可运行 Demo **走 [agents/05-demo.md §5.3.2](agents/05-demo.md#532-完整版--必做的-6-项替代-52-最低标准) 六项**，禁止用「happy path + 一个行为然后关进程」交差，也**禁止**用纯终端 `index.ts` 交差。不要把外部条 Demo 做成第二份模块 00 mini-app。

#### 判断块（勾进度前必打）

**判断前必扫变体**（[§6.3](../agents/05-demo.md#63-讲完前的自查触发器)）：本条核心概念的所有变体/分支是否列全？→ 每个变体决定"无 / 伪代码 / 可运行"；→ 每个变体对应需求清单一条 + 每个可观察变体对应至少 1 个 step-N。漏变体 = 闸门不会过。

```text
Demo 判断
- 小节：{该行「重点」}
- 结论：无 | 伪代码 | 可运行
- step-1 起手：一句话点明本条 step-1 只演示什么（如「1 函数 mock tool_call JSON」/「请求/响应 shape 静态展示」/「单 tool_call happy path」）
- 锁定时机：学习者主动决定（不是自动触发；详见 §5.3.14）
- 理由：{对照「本条要能讲清」}
- 落点：— | 该条 MD 机制节 | apps/{模块文件夹}/{小节文件夹}-step-{N}/ · yarn app:{模块两位}-{小节两位}-{英文短名}-step-{N}
- N 动态：step-1 是工作区（自由打磨），学习者主动说「锁定」后才算这步完成；双方再决定下一步加什么（[§5.3.14](#5314-demo-子节拆分动态引导由浅入深新)）。**禁止预判 N 步**；禁止一次连落多步
- 与 start 预告：一致 | 改判：{一句}
```

N 动态 + 学习者锁定（[§5.3.14](#5314-demo-子节拆分动态引导由浅入深新)）：至少 1 个 step-N 被学习者主动锁定（✅）→ 可勾本条 ✅；后续 step-(N+1) 是「加深」，✅ 后可继续加，不阻塞当前条。

#### `coach next` 闸门

外部条勾 ✅ 前闸门是**三件事**——
1. 小节 MD 已过 [§7.2](../AGENTS.md#72-沉淀--小节进度对齐)
2. Demo 行不是 `未判`（必须是 `无` / `伪代码（见机制）` / `已落 …`）；可运行条还须 `apps/{模块文件夹}/` 下有 step-N 被锁定（✅）+ 有对应 `yarn app:…-step-N` + 锁定时 `node scripts/check-demo.cjs apps/{模块文件夹}/{小节文件夹}-step-N` 过 + [§5.3.2](#532-完整版--必做的-6-项替代-52-最低标准) 六项齐（含 `GET /health` + 页脚 `#env-info`、`#page-intro`）。脚本必须是 `tsx …/{小节文件夹}-step-{N}/server.ts`（不是 `index.ts`）。默认端口必须在 [apps/README.md](../apps/README.md) 占用表里**唯一**，并与本条 `runtime-ctx.ts` `.default(...)`、该条 README「端口」行三处一致；撞车或三处对不上 → **不准勾**
3. **[§5.4](#54-目标--代码整合闸门两段式新) 目标 ↔ 代码整合闸门**（5.4.A / 5.4.B）——任意一段不过，**不准勾**

「锁定 + §5.3.2 + check-demo」只解决第 2 件事；**目标 ↔ 代码整合**单列。复盘行不打 §5.4（[§7.3](../AGENTS.md#73-模块复盘进度表最后一行) 只过 MD 闸门）。Demo 判断不改当前条锁定。

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
  - 可运行但 `package.json` 里没有对应 `app:{MM}-{SS}-{name}-step-N` → **不准勾**（与下面闸门相同）。
- 共用：`typecheck`（`tsc --noEmit`）。
- Key 只读 `apps/.env`：`load-root-env.ts` 从 `apps/load-root-env.ts` 读取 `apps/.env`。Demo 里不要再放 `.env`。
- 技术栈与 [§5.0](#50-代码落点规范node--ts--注释--key--选型) 相同：TS 5 + Node ≥22 + yarn；`tsconfig` `extends` `./tsconfig.base.json`；相对导入带 `.js`；`catch (error: unknown)`。写 `.html` 时 Tailwind 脚本必须用 §5.0 **HTML** 那一段（含 `integrity`），不要换。
- 起步依赖：见 [§5.0](#50-代码落点规范node--ts--注释--key--选型)。本条需要协议 B 再加 `@anthropic-ai/sdk`。不要预装智谱专属 SDK / LangChain / 向量库 / Playwright（模块未学到）。
- **无** `LEARNING.md`。概念 / 易混 / 例子只在该条小节 MD。
- 该小节文件夹不 import 其它小节、不 import 模块 00 mini-app。

### 5.3 小节 Demo 完整版（前后端 · React + koa，2026-09-02 维护模式起生效）

`§5.2`「最小可运行」对外部小节不充分：起进程看一次响应就关掉，看不到错误态、看不到对照。**2026-09-03 起：凡结论是「可运行」的外部小节一律按 §5.3 全栈版写**（调 API 与纯本地计算都要有页面）。禁止用「happy path + 一个行为」交差，禁止只留终端 `index.ts`。

#### 5.3.1 适用范围

| Demo 类型 | 走哪 |
| --------- | ---- |
| **可运行外部条**（调 API、流式、对照、以及 Token encode / Zod parse 这类本地计算） | **§5.3**（本节，前后端；必须有 HTML） |
| **模块 00 mini-app** | 与上相同：`server.ts` + `public/`；**禁止** CLI |

#### 5.3.2 完整版 = 必做的 6 项（替代 §5.2 最低标准）

| # | 项 | 含义 |
| - | -- | ---- |
| 1 | **Happy path** | 本条主要用例完整跑通（对照、并排、多端点等按该条需求，不要只打一次就关进程） |
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
│   ├── http/              ← runtime / 错误透传 / 入参闸门
│   ├── tools/             ← 例：Registry、Tool 定义
│   ├── schema/            ← 例：Zod → JSON Schema
│   └── flow/              ← 例：主流程小函数
├── routes/                ← health + 一个独立业务端点（或一组强相关端点）一个文件
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

业务 handler 写在 `routes/*.ts`（薄：闸门 → flow → `ctx.body`）。SSE 同样在 route 里（见下面「SSE 端点」）。

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

模块 00 mini-app 与其它条一样走根目录 `server.ts` + §5.3 HTML，端口按 §5.3.3 顺序分配（首个 50000）。已 ✅ 的旧 HTTP Demo **不回头拆**，除非学习者点名。

#### 5.3.8 HTTP Demo 拆分（多场景 / 多接口时强制）

2026-09-03 维护模式起生效。

**问题**：多个独立场景的接口和 UI 全塞进一个 `server.ts` + 一个 `index.html`，文件过大，人和 Agent 都不好改。只「拆成很多文件」不够——平铺的 `lib/*.ts`、一个巨型 `ui.js` 仍然难读。

**入口仍然只有一个**：yarn 脚本 → `tsx …/server.ts`；浏览器默认 `http://127.0.0.1:{PORT}/`。禁止每个场景一个进程、一个端口、一条 yarn 脚本。条与条仍不互相 import。

| 何时 | 怎么做 |
| ---- | ------ |
| **每条 HTTP Demo**（含 1 个页面） | `server.ts` 只装配；至少 `routes/health.ts` + `lib/http/runtime-ctx.ts` |
| **每个独立功能场景** | **必须再拆**（`public/pages/{场景}.html` + `routes/{场景}.ts`）—— **页与接口 1:1**：一个页面 = 一个独立 route 文件；同一端点用 query/body 参数区分 sub-variant 可以，但**不能跨场景**（如"跑单跑"和"串/并行对比"是两个场景 → 两条 route） |
| **Registry / 执行器 / 错误处理要复用** | 抽到 `lib/tools/`、`lib/flow/`、`lib/http/` 分层；不重复实现 |

**页与接口 1:1 规则（2026-09-04 维护模式起生效 · 高频错误）**：每个独立场景 = **单独 page + 单独 route 文件**。禁止把多个独立场景塞进同一个 page（用 tab/按钮充数）、禁止把多个独立场景塞进同一个 route（用 mode 参数切换）。理由：
- 学生切页面 = 换业务场景；切按钮 = 同一场景的不同动作。两者**视觉上不同**。
- 一个 route 文件 ≤ 一个端点的入参/出参；模式多了就长满 `if (mode === "...")`，教学点被淹没。
- 改一个场景的入参校验 / 错误处理不应碰另一个场景；同一文件必然互相影响。
- 子参数（如 `mode=parallel|serial`）属于**同一场景**的不同切面，**不**触发拆分；该场景共用一个 page + 一个 route。

**反例（`step-3` 2026-09-04 之前）：** 单 page + 单 `/api/plan` 用 `mode` 参数同时服务"跑单跑"和"串/并行对比"两个场景 → **违反规则**。正确：`/pages/single.html` + `/api/plan`（mode 切换 parallel|serial）；`/pages/compare.html` + `/api/compare`（内部并发两个 sub-call）。

##### 怎么拆才算对（忌乱拆）

**按职责分层，不按「行数硬切」。** 同一类职责放同一子目录；主流程拆成可读的小函数（大约十几～二十行），**同层相关的小函数放在同一文件里**，不要一函数一文件。

| 问自己 | 拆 | 不拆 |
| ------ | -- | ---- |
| 两个页面/两个端点互不依赖，改 A 不该碰 B？ | 分文件 / 分页面 | — |
| 只是同一流程里的相邻步骤（parse → validate → handler）？ | 同文件多个小函数，或同目录相邻文件 | 不要拆成 5 个各 5 行的空壳文件 |
| 这段是「工具定义」还是「HTTP 错误」还是「主循环」？ | 放进对应职责目录（`tools/` / `http/` / `flow/` …） | 不要全堆进一个 `lib/helpers.ts` |
| 文件打开后，名字能否看出职责？ | `execute-one-tool-call.ts`、`pages/serial.html`、`components/rounds.js` | `utils2.ts`、`misc.js`、`temp.html` |

**后端 `lib/` 常见切法**（子目录名按本条语义取，不必照抄英文单词，但**必须**能一眼看出类）：

| 子目录 | 放什么 | 不放什么 |
| ------ | ------ | -------- |
| `tools/` | Registry、`defineTool`、各 Tool 的 Zod + handler 定义、Tool 类型 | HTTP ctx、LLM 循环 |
| `schema/` | Zod ↔ JSON Schema 等契约转换 | 业务 handler |
| `tokenize/` / `vec/` | 本地计算（encode、余弦、玩具向量表） | HTTP ctx |
| `flow/` | 主流程：执行一个 tool_call、并行 execute、拼 messages、run loop、repair 闭环 | koa `ctx` 读写 |
| `http/` | PORT/llm 单例、入参闸门、上游错误透传 | Tool 业务逻辑 |

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

- 每个文件头：**职责**（这个文件干什么）+ **数据流**（进什么、出什么）+ 必要时 **为什么单独成文件**。
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
- 一函数一文件、五六行空壳「拆分」
- 场景页之间 ESM import
- 把「拆文件」理解成「拆成多个 Demo 文件夹 / 多个端口」
- 用现有某条 Demo 当模板去抄；对照本节 + §5.3.4 骨架写
- 含糊文件名：`helper` / `common` / `misc` / `temp` / `ui`（当它已是整包杂烩时）

**`coach next` 闸门补一句**：该落可运行且命中本条「必须拆」时，`server.ts` 仍须是 yarn 入口；业务在 `routes/` + 分层 `lib/`；`public/` 须有场景页（`pages/` 或等价），共享 UI 按 `components/` + `utils/` 分类，不能只有一个塞满的 `index.html` / 一个巨型 `ui.js`。

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

**这些 Demo 的读者是「几个月后回来复习的自己」**。合上笔记只看页面，也要能讲清这一页在演示什么。教学信息写在**页面上**，不是只写在 README 或代码注释里。

> 强约束，对应 [AGENTS.md §5.3 高频遗忘](../AGENTS.md#53-小节-Demo-完整版前后端--react--koa2026-09-02-维护模式起生效)：**请求参数 / 调用流程 / 响应结果**三件都得上页，不要只露成功按钮。

| 位置 | 必须写什么 | 例子 |
| ---- | ---------- | ---- |
| `#page-intro` | ① 一句「本页只演示 X」；② 3～5 步数据流（点了按钮 → 服务端做什么 → 结果怎么回来） | 「本页只演示并行 tool_call：一次返回两个调用，服务端 `Promise.all` 执行」 |
| 每个按钮 / 输入框旁 | 一句「点了会发生什么、期望看到什么」 | 「跑并行：期望 Round 1 出现 2 个 tool_call」 |
| 输出区每个卡片 | 这一块对应协议里的哪个字段 / 哪一步 | 「tool_result（执行结果 → 回灌模型）」 |
| 关键判定处 | 为什么是这个结果、判错会怎样 | 「Zod ✗ → 错误当 tool_result 回灌，模型才有机会改对」 |

- 总览页（多页 Demo）额外画一张全局数据流（`<pre>` ASCII 即可）+ 各场景一句话导航。
- 术语第一次出现跟一句人话解释；不要只堆 `finish_reason=tool_calls`。
- 分寸：解释「这一步在协议里是什么」，**不要**把小节 MD 的完整教学搬进页面。页面是「看得见的机制」，MD 是「讲透的知识」。
- 禁止：只有按钮没有任何说明；用 `TODO` / `待补充` 占位；说明与实际行为不符（改了行为必须改说明）。

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
| 类型与校验 | 服务端入参 Zod 或显式闸门；`catch (err: unknown)` |

**独立性（不因为拆分而互相引用）**

- 允许 import 的**只有** `apps/llm.ts`（`getLlm` / `getLlmOptional` / `logLlmConfig`）、`apps/load-root-env.ts`（环境变量）、`apps/logger.ts`（日志服务，[§5.3.16](#5316-详细日志强制)）——顶层基础设施。
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

- 已 ✅ 的旧 Demo **不回头拆**，除非学习者点名。
- 禁止：一个 route 内按协议分叉；页面用 tab 在 A/B 之间切（对照条走并排，不是切换）；B 版复用 A 版的 `lib/`。

**`coach next` 闸门补一句**：本条同时演示 A 与 B 时，`apps/` 下必须能看到两个文件夹 + 两条 yarn 脚本 + 两个端口；属于「对照」例外的，`lib/` 下必须有按协议分开的子目录。

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
| §5.2 Demo 判断块 | 写「子节拆分：N」 | 写「step-1 起手」+「锁定时机：学习者主动决定」+「N 动态」 |
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

**闸门只在「锁定」时校验**。step-1 起手可以小到「1 个 mock 函数 + 1 个按钮 + 1 个 #output」，不需要 health / env-info / 两类错误。等学习者说「锁定」，再补齐 §5.3.2 → 过 check-demo。

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
- 教练替学习者决定「这步够了」（锁定是学习者的决策，**不是**自动触发）
- 跳过第 3 步直接进第 4 步（学习者没确认懂之前不该推进）
- step-N 锁定后偷偷改代码（违反「锁定 = 冻结」；要改 = 建 step-(N+1)，bug 修复除外）
- 在 step-N 内「加开关变量 + 条件渲染」做 step-(N+1) 的功能（隐藏分支；用 copy + delta 增量构建）

##### step-1 起手（§5.2 Demo 判断块写）

§5.2 Demo 判断块**不预判 N**，只写 step-1 起手。原则：

- `step-1` = **能多小就多小**；目的是让学习者**看见**概念或**跑一遍**最简闭环
- **推荐起手 A**：「1 个函数 + 1 个按钮 + 1 个 #output」，mock 返回固定数据；不调 LLM
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
| mock / 测试值 | 改当前 step 自己的；上一步保留旧值 |

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

##### 闸门

- **锁定时**：§5.3.2 6 项齐 + `node scripts/check-demo.cjs apps/{模块文件夹}/{小节文件夹}-step-N` 过 + 学习者主动决定锁
- `coach next` 勾本条前：MD 已沉淀 + **至少 1 个 step-N 锁定（✅）** + 学习者说「我懂了」
- **不要求**所有未来 `step-(N+1)` 完成，因为 N 是动态的
- 已 ✅ 的小节**可以**继续加 `step-(N+1)`（加深场景）；新加的 step 走相同闸门
- 已 ✅ 的旧 demo（不是新模型产生的）**不**回头拆

##### 什么时候不拆

- 本条「本条要能讲清」只有一件事
- 教学点天然分不开
- 本条 ≤ 1 个端口 / ≤ 1 个页面

**`coach next` 闸门补一句**：本条可运行时，`apps/{模块文件夹}/` 下至少要有 1 个 `{小节文件夹}-step-{N}/` **已锁定（✅）+ check-demo 过**。未锁定的 step-N 不算完成。**这解决「demo 完整度」闸门；目标↔代码整合还须过 §5.4**（目标→代码覆盖 / 文档→代码对齐两段）。

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

**目的**：**详细优先**（不是主流程优先）。控制台看不清大量日志 / 没时间戳 / 电脑卡顿 → 服务端写文件。几个月后回来翻日志也能讲清流程。

**路径**
- 服务端日志文件：`apps/{demo}/logs/{YYYY-MM-DD}.log`（**按 BJT 日切**，demo 自管，删 demo 一起带走；同一天多进程共享同一文件，`appendFileSync` 原子追加即可）
- 前端：**不写日志**——页面已展示请求参数 / 调用流程 / 响应结果（§5.3.10 / §5.3.11 / §5.3.2 #4），不再重复打 #log 区

**顶层实现（一个文件）**
- `apps/logger.ts` 导出 `createLogger(logDir)`（也可传 `{ logDir, consoleLevel? }`）—— **内置**安全序列化（私有，不导出；处理 Error / Map / Set / Date / Buffer / 循环引用 / 大对象截断）
- 每个 demo 在 `lib/logger.ts` 一行建本地 logger，业务代码 `import { logger } from "./logger"` 直接用；**调用方不感知写文件 / 写 console 两件事的细节**

**lock-time freeze（已锁定 demo 必读）**
- 顶层 `apps/logger.ts` 是**模板**——未来会改；已锁定 step 不能被未来顶层改动影响
- **每条 demo 锁定 step 的那一刻**：把当时顶层 `apps/logger.ts` 完整拷一份到 `apps/{demo}/lib/logger.ts`（顶部 doc comment 可改为「本地 freeze 副本 · 锁定于 YYYY-MM-DD」），demo 业务代码 import 路径不变（仍是 `./logger`）
- 顶层 `apps/logger.ts` 未来改动：只影响新 demo / 新 step；已 freeze 的副本不动
- 已锁定 step 业务代码（registry / chat / server 等）使用 demo 本地 logger，**不感知顶层**
- freeze 操作是 `node scripts/check-demo.cjs` 前的最后一步；§5.4 闸门要求 logger 在 demo 本地独立可用

**API（业务代码视角，四参调用极简）**

```ts
logger.debug(scope: string, msg: string, explain: string, data?: unknown)
logger.info (scope: string, msg: string, explain: string, data?: unknown)
logger.warn (scope: string, msg: string, explain: string, data?: unknown)
logger.error(scope: string, msg: string, explain: string, data?: unknown)
```

**约定（业务代码写法）**
- `scope`：**中文节点名**，讲清"在哪一段 / 哪个步骤"（例：`工具调用-解析`、`消息装配-组装`、`循环-第1轮`）
- `msg`：**一句话中文动作**，讲清"现在在做什么"（例：`进入 Zod 校验`、`拿到模型响应`）
- `explain`：**人话释义**，讲清"为什么打这个日志 / 给谁看 / 解释什么"——**必填**（详细优先，宁啰嗦不省）
- **文件里不写服务名**：logDir + 文件名自带 demo 语义；头里不带 `[serviceName]` 块

**每条格式**
- 服务端文件：**基础信息单行** `YYYY-MM-DD HH:MM:SS.mmm +08:00 <LEVEL> <scope>` + 下一行 `  msg=<中文>`（**北京时**，可视化）
- data（如果有）**下一行起** `JSON.stringify(data, null, 2)` 缩进 2 格式化的多行 JSON——可读、grep head 干净、不用 jq
- **`data.__code` 字段**：约定为**源代码字符串**（业务调大模型的代码片段）；logger 自动以 `── code ──` / `── end code ──` 分隔块单独输出——「源代码在日志里」就能看到调用形式（含变量值）。示例：`logger.info("llm.request", "...", { model, messagesCount, ..., __code: \`await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});\` })`
- **LLM 响应打整个对象**：不要挑字段（id / choices / usage / SDK 自带字段），直接 `logger.info("llm.response", "← got response", response)`

**内置序列化（data 不能崩）**

| 类型 | 怎么显示 |
| ---- | -------- |
| `Error` | `{ name, message, stack, ...自定义字段 }` |
| `Map` | 转对象；`Set` 转数组 |
| `Date` | ISO string |
| `Buffer` | `{ type: "Buffer", length, hex-preview }` |
| `undefined` / `null` | 字面量字符串 |
| 循环引用 | `"[Circular]"` |
| 函数 | `"[Function: name]"` |
| 大对象 (>50KB) | 截到 50KB + 标 `"...truncated"` |

**业务代码打日志原则（详细优先）**
- 主流程每个关键步骤都打：parse / validate / execute / assemble / loop / retry / repair / 等
- 与 [§5.3.11 `// ①②③` 注解](../AGENTS.md#53-小节-Demo-完整版前后端--react--koa2026-09-02-维护模式起生效) 对齐：在该行附近插一行 `log.info(...)`，不打断主流程
- `debug` 调试细节；`info` 主流程节点；`warn` 异常但可走通；`error` 失败
- **不**因为怕啰嗦省略；可读性 > 行数
- **调大模型时**：data 加 `__code` 字段（源码字符串，调大模型的代码片段）；同时打**整个** `request` / `response`（不挑字段）—— 详见上面「每条格式」

### 5.4 目标 ↔ 代码整合闸门（两段式）·新

2026-09-04 维护模式起生效。

**问题**：旧闸门（[§5.2](#52-小节-demo)「`coach next` 闸门」+ [§5.3.14](#5314-demo-子节拆分动态引导由浅入深新) 「闸门」）只查「demo 跑通没 / §5.3.2 6 项齐没 / check-demo 过没 / 锁没锁」。**这些都只是「代码存在」**——但「代码存在」≠「本条要能讲清」。MD 写满了「含并行调用」+「Promise.all」，代码里却用同步 `.map(...)`，跑通 + 6 项齐 + check-demo 过 + 双 step 锁定，**闸门全过、可勾 ✅**——可「并行调用」这个目标点根本**没在代码里真实跑过**，合上笔记讲不清「真实跑过的并行时序长什么样」。

**解决**——勾 ✅ 前再加一道闸门，**两段式**，**两段都过**才能勾。任意一段不过 → 不准勾 ✅。

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
| A1 能画出 5 动作一圈（model → tool_call → execute → tool_result → final_reply） | ✅ | step-1 五张卡片 (#card-input / #card-decide / #card-execute / #card-result / #card-final) + step-2 #llm-protocol 四张 Request/Response 卡 |
| A2 **含并行调用** | ❌ | step-1 routes/chat.ts:85 `model_tool_calls.map(...)` 同步；registry.ts:50 `executeTool` 同步；handler 同步；grep 全模块 `Promise.all` 仅 0 处实际调用（4 处全在注释 / docstring / 前端文案） |

#### 5.4.B 文档 → 代码对齐（反向）

**问题**：MD 文档里**讲到的**每条机制 / 例子 / 踩坑 / 易混点，对应的**代码 / 行为在代码里真实存在吗**？

**步骤**：

1. 通读小节 MD 的「是什么 / 为什么 / 易混点 / 例子 / 踩坑 / 需求清单 / 还没搞懂的 / 我追问过的」各节，**逐条**列出 MD 提到的**可被代码实现的具体行为**（机制点 / 例子场景 / 需求场景 / 踩坑演示 / 易混对比）。
2. 对每一条，在已锁定 step-N 的代码 + 页面里找对应——具体到 `step-N 文件路径 + 行号` / `按钮 / 卡片`。找不到 = **缺口**（文档说太多 / 代码没实现）。
3. 写「文档讲点 ↔ 代码行为」表，状态 ✅(代码里能找到) / ❌(代码里没有)。
4. **反向扫一遍**——MD 比代码多 = 缺口。理由：「MD 写满 vs 代码只实现一部分 = 文档虚胖」，是最常见的「看着完整实则不完整」。

**示例**：模块 05 · 01 Function Calling 协议（实际跑出来 ❌）

| MD 讲点 | 代码里有没有 | 状态 |
|---|---|---|
| 「例子 4 · 前端：**并行**调用（旅游规划助手）—— 5 月东京 7 天要带什么、机票多少钱？」 | step-1 / step-2 都没有这个场景按钮；handler 同步；前端无并发时序图 | ❌ |
| 「易混点：并行调用 ≠ SDK 自动；必须 `Promise.all`」 | 代码没用 `Promise.all` | ❌ |
| 「踩坑：串行 `for await` 执行 → 模型嫌慢 → 编造结果」 | 同步 `.map`；没演示「串行 vs 并行」对比；前端无延迟对比 | ❌ |
| 「易混点：OpenAI strict 模式不带 `additionalProperties:false` → 400」 | 代码没演示 strict 模式 | ❌（**这个** 是「MD 写漏」反向——**不是缺口**；缺口只算「MD 说 vs 代码没说」的反向） |

#### 闸门逻辑

```
目标 ↔ 代码整合闸门（§5.4）
├─ §5.4.A 目标 → 代码覆盖
│   ├─ 所有目标点状态 ✅ → A 段过
│   └─ 任一目标点 ❌ → A 段不过
└─ §5.4.B 文档 → 代码对齐
    ├─ 所有 MD 讲点状态 ✅ → B 段过
    └─ 任一 MD 讲点 ❌（代码里没实现） → B 段不过

A 段过 + B 段过 → §5.4 过 → 才进 §5.2 闸门判（demo 完整度）
A 段不过或 B 段不过 → §5.4 不过 → 不准勾 ✅
```

#### 触发时机

| 时机 | 必打？ |
|---|---|
| `coach status`（任何外部条，且当前条未 ✅） | **必打**——扫到缺口立即列 |
| `coach start`（外部条） | **必打**——即便看着齐也主动扫一遍 |
| `coach next`（外部条勾 ✅ 前） | **必打**——不过不准勾 |
| `沉淀文档`（增量更新某条 MD） | **必打**——增量更新后必须重跑 §5.4.B（文档改了，对齐可能破） |
| `模块复盘`（最后一行） | **不打**——[AGENTS.md §7.3](../AGENTS.md#73-模块复盘进度表最后一行) 只过 MD 闸门，不查代码 |
| 已 ✅ 的旧条（不在当前条） | **不打**——除非学习者点名补漏 |

#### 输出模板（写到小节 MD 的「Demo 子节进度」表之后）

```markdown
## §5.4 目标 ↔ 代码整合闸门

跑闸门日期：YYYY-MM-DD

### §5.4.A 目标 → 代码覆盖

「本条要能讲清」：{原文}

| 目标点 | 状态 | 证据 |
|---|---|---|
| {动词 + 可观察行为} | ✅ / ❌ | {step-N 文件:行号 / 按钮 id / 接口字段} |

**A 段小结**：过 / 不过。缺口 N 条：{列每条缺什么、建议补在 step-N / step-(N+1)}。

### §5.4.B 文档 → 代码对齐

| MD 讲点 | 代码里有没有 | 状态 |
|---|---|---|
| {MD 原文一句话} | ✅ / ❌ | {step-N 文件:行号} |

**B 段小结**：过 / 不过。缺口 N 条：{列每条 MD 多讲的、代码没实现的}。
```

#### 禁止

- 「代码存在」就放过闸门——必须逐点对证据
- 「看着齐就放过」——必须主动扫
- 把「目标点」写成「机制描述」（目标点 = 可观察行为，不是「过程定义」）
- 把「MD 讲点」当成「MD 章节标题」——必须是 MD 里**具体的一句机制 / 例子 / 踩坑**
- §5.4.A 缺口 = 「拒绝当前条 ✅」；不是「自动建 step-(N+1) 补」——补不补、怎么补由学习者决定（参 [§5.3.14 交互检查点协议](05-demo.md#交互检查点协议每步之间必走)）
- 已 ✅ 的旧条不回头跑 §5.4 闸门（除非学习者点名补漏）

#### 闸门与闸门分工

| 闸门 | 解决什么 |
|---|---|
| **[§7.2](../AGENTS.md#72-沉淀--小节进度对齐)** | MD 是否沉完、能否讲清「本条要能讲清」 |
| **[§5.2 `coach next` 闸门](#52-小节-demo)** | demo 是否存在 / 跑通 / §5.3.2 6 项齐 / check-demo 过 / 已锁定 |
| **§5.4（新增）** | 「本条要能讲清」的目标 ↔ 代码 ↔ 文档三方对齐 |
| **[§7.3](../AGENTS.md#73-模块复盘进度表最后一行)** | 模块复盘行专用，只过 MD 闸门 |
