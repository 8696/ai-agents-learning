# AI Agent 开发学习仓库

从 0 到 1 学 **AI Agent 开发**：一条可执行路线 + 最多五个动手项目。面向前端转 Agent，主线是 **TypeScript + Node.js**，调用云端模型 API，不训练模型。

根目录没有业务应用。打开仓库先分清两件事：

| | 是什么 | 去哪 |
| - | ------ | ---- |
| **学什么、怎么验收** | 路线、模块、题目、笔记 | [`docs/`](docs/00-目录.md) |
| **代码落哪、助手怎么陪跑** | 何时建 `apps/`、怎么回填 | 本页 + [`AGENTS.md`](AGENTS.md) |

`docs/` 可以单独拿走当总纲。拿走之后，文档里的「ChatGPT Mini」等是**作品名**，本仓库路径以本页为准。

**编号不要混：** `docs/01-使用协议.md` 是文档第 1 篇；**模块 01** 是「AI & LLM 基础认知」。说「01」时写全名或写路径。

---

## 现在怎么开始

1. 读 [`docs/02-怎么用.md`](docs/02-怎么用.md)（含默认选型），再按 [`docs/03-学习路线.md`](docs/03-学习路线.md) 的 24 个模块走。
2. 过没过完、现在学哪一条：看 [`docs/06-学习总览.md`](docs/06-学习总览.md) 和对应模块文件夹里的 **小节进度**。
3. 配环境：在 `apps/` 下 `nvm use`（推荐 Node 22，**最低 ≥22**），`cp apps/.env.example apps/.env`，填 Key。包管理用 **yarn**。
4. 对 Cursor / Claude Code / Codex 说 `coach start`（忘了进度说 `coach status`）。助手按 `AGENTS.md` 陪跑，不要让它跳模块。

当前：模块 00 已完成；模块 01 外部学习进行中。精确到哪一条以学习总览为准。

---

## 仓库结构

不抽共享包，不上 monorepo。每个 `apps/*` 自己有 `package.json`，**学到再创建**，禁止第 6 个 app。共用配置只放在 `apps/`：`.nvmrc`、`.env.example`、`tsconfig.base.json`。

```text
ai-agents-learning/
├── README.md          ← 给人看（本页）
├── AGENTS.md          ← 给 AI 看（建目录、coach、写回笔记）
├── docs/              ← 学习文档
│   ├── 00-目录.md
│   ├── 01–07          ← 协议 / 怎么用 / 路线 / 题库 / 资源 / 总览 / 术语
│   └── 学习模块/      ← 模块 00–23：一模块一文件夹，一小节一个 MD
└── apps/
    ├── .nvmrc · .env.example · tsconfig.base.json
    ├── 01-chatgpt-mini/     ← 模块 00 已建
    ├── 02-tool-agent/       ← 模块 05
    ├── 03-knowledge-agent/  ← 模块 08
    ├── 04-research-agent/   ← 模块 11/12
    └── 05-coding-agent/     ← 模块 15
```

新能力能加进已有 app 就加进去。细节见 `AGENTS.md` §4–5。

| 项目 | 目录 | 主要模块 |
| ---- | ---- | -------- |
| ChatGPT Mini | [`apps/01-chatgpt-mini`](apps/01-chatgpt-mini) | 00、02–04、06；22 最简 UI（模块 01 只写笔记） |
| Tool Agent | `apps/02-tool-agent` | 05、07，回填 10、11 |
| Knowledge Agent | `apps/03-knowledge-agent` | 08、09，回填 17、18 |
| Research Agent | `apps/04-research-agent` | 11–14，回填 19、21 |
| Coding Agent | `apps/05-coding-agent` | 15、16、20，回填 22、23 |

每个已建项目：`README.md` 只管现在怎么跑；`LEARNING.md` 是当前代码地图。概念笔记写在 `docs/学习模块/` 对应小节 MD。

跑 ChatGPT Mini：`cd apps && nvm use`，配好 `.env`，再 `cd 01-chatgpt-mini && yarn install && yarn dev`。

---

## 怎么学

每个模块先外部（概念，写进该条小节 MD）→ 再本地（验收 + `{NN}-本地产出.md`；有代码则更新该 app 的 `LEARNING.md` / `README.md`）→ 才进下一模块。禁止跳条。

对助手只需三条命令：

| 你说 | 它做什么 |
| ---- | -------- |
| `coach status` | 报进度：在哪、刚过完什么、现在学什么、下一条是什么 |
| `coach start` | 讲当前条。外部节奏会给出门包（网上搜什么 + 可复制去问另一套 AI 的提问）和完整讲解 |
| `coach next` | 当前条达标后勾进度、进下一条。笔记空壳不准勾 |

讲概念、考我、贴报错、review 直接说即可。完整约定在 `AGENTS.md` §6。

学习笔记由助手按模板写入小节 MD，你只减不加。看过的外部 URL 填进该模块 README 的「我的链接」（没有就写 `暂无链接`）。

---

## 技术栈（学习默认）

- **运行时**：TypeScript 5 + Node.js ≥22 + yarn
- **模型**：MiniMax / 智谱（各支持 OpenAI + Anthropic 双协议，同 Key 换 Base URL）+ Anthropic 官方
- **SDK**：协议 A → `openai`；协议 B → `@anthropic-ai/sdk`
- **Key**：只放 `apps/.env`，不进 git

选型理由和何时才换供应商，见 [`docs/02-怎么用.md`](docs/02-怎么用.md) §1.2。模块 00 只要求 MiniMax 协议 A；协议 B 对照在模块 02。
