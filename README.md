# AI Agent 开发学习仓库

从 0 到 1 学 **AI Agent 开发**：一条可执行路线 + 最多五个动手项目。面向前端转 Agent，主线是 **TypeScript + Node.js**，调用云端模型 API，不训练模型。

根目录没有五个项目的业务应用。打开仓库先分清三件事：

|                 | 是什么              | 去哪                            |
| --------------- | ---------------- | ----------------------------- |
| **学什么、怎么验收**    | 路线、模块、题目、笔记      | `[docs/](docs/00-目录.md)`      |
| **五个项目代码落哪** | 何时建 `apps/`、怎么回填 | 本页 + `[AGENTS.md](AGENTS.md)` §4–5 |
| **小节 Demo** | 每条外部学完判断要不要可运行小样例 | `[AGENTS.md §5.2](AGENTS.md#52-小节-demo与五个项目分离)` · `[demos/](demos/)` |

`docs/` 可以单独拿走当总纲。拿走之后，文档里的「ChatGPT Mini」等是**作品名**，本仓库路径以本页为准。

**编号不要混：** `docs/01-使用协议.md` 是文档第 1 篇；**模块 01** 是「AI & LLM 基础认知」。说「01」时写全名或写路径。

要从 0 清空进度与项目再开练：见 `[RESET.md](RESET.md)`（仅在你明确要清时打开）。

---

## 快速命令

| 你说 | 它做什么 |
| --- | --- |
| `coach status` | 报进度：在哪、刚过完什么、现在学什么、下一条是什么 |
| `coach start` | 讲当前条。外部：出门包 + 完整讲解 + **本条产出预告**（要不要写 Demo、要不要回填项目；默认先不落，你说写就写） |
| `coach next` | 当前条达标后勾进度、进下一条。笔记空壳不准勾 |
| 进入维护模式 | 改陪跑 / 学习过程 / Agent 交互。**默认是学习**；未点名不要走维护 |

---

## 怎么使用

### 1. 拉仓库

```bash
git clone <本仓库地址>
cd ai-agents-learning
```

用 Cursor / Claude Code / Codex 打开这个目录（助手会读根目录 `[AGENTS.md](AGENTS.md)`）。若需要先清进度 / 动手项目，打开 `[RESET.md](RESET.md)` 按里面的话对助手说即可。

### 2. 配环境，再开练

1. 读 `[docs/02-怎么用.md](docs/02-怎么用.md)`（含默认选型），路线见 `[docs/03-学习路线.md](docs/03-学习路线.md)`。
2. `cd apps && nvm use`（推荐 Node 22，**最低 ≥22**），`cp .env.example .env`，填 Key。包管理用 **yarn**。
3. 对助手说 `coach start`。之后按模块：**外部**（概念 + **当场告诉你本条要不要写 Demo / 要不要回填项目** → 写入该条小节 MD → **按预告落小节 Demo**（`demos/`）**以及本条这一刀增量回填**）→ **本地**（验收**收口** + `{NN}-本地产出.md`；有代码则更新该 app 的 `LEARNING.md` / `README.md`）→ 才进下一模块。禁止跳条。不要把整模块代码攒到最后一节才一次性写。

讲概念、考我、贴报错、review 直接说即可。不好处理或有多个合理选项时，助手先给选项、说明为什么、推荐一个并说明为什么，等你选。笔记由助手按模板写入，你只减不加。看过的外部 URL 填进该模块 README「我的链接」（没有就写 `暂无链接`）。完整约定见 `[AGENTS.md](AGENTS.md)` §6。

进度以 `[docs/06-学习总览.md](docs/06-学习总览.md)` 与各模块 **小节进度** 为准。

---

## 仓库结构

不抽共享包，不上 monorepo。每个 `apps/*` 自己有 `package.json`，**学到再创建**，禁止第 6 个 app。小节教学 Demo 在 `demos/`（不是第 6 个 app；条与条隔离）。共用配置只放在 `apps/`：`.nvmrc`、`.env.example`、`tsconfig.base.json`。

```text
ai-agents-learning/
├── README.md          ← 给人看（本页）
├── AGENTS.md          ← 给 AI 看（建目录、coach、写回笔记、小节 Demo）
├── RESET.md           ← 清进度 / 清 apps / 清 demos（按需打开，非日常）
├── docs/              ← 学习文档
│   ├── 00-目录.md
│   ├── 01–07          ← 协议 / 怎么用 / 路线 / 题库 / 资源 / 总览 / 术语
│   └── 学习模块/      ← 模块 00–23：一模块一文件夹，一小节一个 MD
├── demos/             ← 小节 Demo（学到该条且判断要可运行才建内容）
└── apps/
    ├── .nvmrc · .env.example · tsconfig.base.json
    ├── 01-chatgpt-mini/     ← 模块 00 新建
    ├── 02-tool-agent/       ← 模块 05
    ├── 03-knowledge-agent/  ← 模块 08
    ├── 04-research-agent/   ← 模块 11/12
    └── 05-coding-agent/     ← 模块 15
```

新能力能加进已有 app 就加进去。五个项目见 `AGENTS.md` §4–5；小节 Demo 见 §5.2。

| 项目              | 目录                        | 主要模块                             |
| --------------- | ------------------------- | -------------------------------- |
| ChatGPT Mini    | `apps/01-chatgpt-mini`    | 00、02–04、06；22 最简 UI（模块 01 只写笔记） |
| Tool Agent      | `apps/02-tool-agent`      | 05、07，回填 10、11                   |
| Knowledge Agent | `apps/03-knowledge-agent` | 08、09，回填 17、18                   |
| Research Agent  | `apps/04-research-agent`  | 11–14，回填 19、21                   |
| Coding Agent    | `apps/05-coding-agent`    | 15、16、20，回填 22、23                |

每个已建项目：**只有** `README.md`（现在怎么跑）和 `LEARNING.md`（当前代码地图）两份，代码一改就改写这两份。概念笔记在 `docs/学习模块/` 对应小节 MD，**不因项目迭代而改成现在的全貌**。外部小节的可运行小样例在 `demos/`，和五个项目分开，也不和其他小节互相引用。

跑 ChatGPT Mini（模块 00 本地建好之后）：`cd apps && nvm use`，配好 `.env`，再 `cd 01-chatgpt-mini && yarn install && yarn dev`。

---

## 技术栈（学习默认）

- **运行时**：TypeScript 5 + Node.js ≥22 + yarn
- **模型**：MiniMax / 智谱（各支持 OpenAI + Anthropic 双协议，同 Key 换 Base URL）+ Anthropic 官方
- **SDK**：协议 A → `openai`；协议 B → `@anthropic-ai/sdk`
- **Key**：只放 `apps/.env`，不进 git

选型理由和何时才换供应商，见 `[docs/02-怎么用.md](docs/02-怎么用.md)` §1.2。模块 00 只要求 MiniMax 协议 A；协议 B 对照在模块 02。
