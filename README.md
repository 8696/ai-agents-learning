# AI Agent 开发学习仓库

从 0 到 1 学 **AI Agent 开发** 的 Git 仓库。根目录不是业务应用：一边是学习文档，一边是最多五个动手项目。

---

## 两层东西，不要混

| | 是什么 | 在哪 |
| -- | ------ | ---- |
| **学习文档** | 知识、路线、验收、题目。可以单独拿走，也可以按部分拆成多份 md | `docs/` |
| **这个仓库** | 文档在本机如何落地：代码进哪个文件夹、何时新建 | `README.md`、`AGENTS.md`、`apps/` |

`docs/` 已按部分拆开，总目录是 [docs/00-目录.md](docs/00-目录.md)。那是学习文档，不是本仓库说明书。

**编号不要混**：`docs/01-使用协议.md` 是文档第 1 篇；**模块 01** 是「AI & LLM 基础认知」（`docs/学习模块/01-AI与LLM基础认知/README.md`）。说「01」时写全名或写路径。

交给 Cursor / Claude Code / Codex 等助手时读 `AGENTS.md` + `docs/`。怎么建子项目只听 `AGENTS.md`。学习文档里出现的 `apps/` 路径是本仓库落地对照；拿走 `docs/` 时以作品名（ChatGPT Mini 等）为准。

---

## 这份仓库是什么

| 是 | 不是 |
| -- | ---- |
| 一条可执行的学习路线 | 框架教程合集 |
| 一个 Git 仓库里最多 5 个子项目 | 24 个章节 = 24 个文件夹 |
| TypeScript 主线，面向前端转 Agent | 训练模型 / CUDA / 转 Python |

---

## 代码放哪

不抽共享包，不上 monorepo 工具链。每个 `apps/*` 自己有 `package.json`，学到再创建，不要提前建空目录。包管理用 **yarn**。

```text
ai-agents-learning/
├── README.md                      ← 这个仓库给人看
├── AGENTS.md                      ← 这个仓库给 AI 看
├── docs/                          ← 学习文档
│   ├── 学习模块/                  ← 模块 00–23，一模块一文件夹、一小节一 MD
│   ├── 00-目录.md                 ← 总目录
│   ├── 01-使用协议.md
│   ├── 02-怎么用.md
│   ├── 03-学习路线.md
│   ├── 04-自测题库.md
│   ├── 05-资源清单.md
│   ├── 06-学习总览.md
│   └── 07-核心术语.md
├── .gitignore
└── apps/                          ← 学到再创建，不要提前建空目录
    ├── .nvmrc                     ← 推荐 Node 22（在 apps/ 下 nvm use；最低 ≥22）
    ├── .env.example               ← 全 apps 共用 Key 模板
    ├── tsconfig.base.json         ← 全 apps 共用 TS 配置
    ├── 01-chatgpt-mini/           ← 模块 00 时建
    ├── 02-tool-agent/             ← 模块 05 时建
    ├── 03-knowledge-agent/        ← 模块 08 时建
    ├── 04-research-agent/         ← 模块 11/12 时建
    └── 05-coding-agent/           ← 模块 15 时建
```

判断规则：新能力能加进已有 app 就加进去；会改掉现有应用的核心隐喻，才新建。禁止第 6 个 app。细节和模板见 `AGENTS.md` 第 4–6 节。

| 总纲项目 | 目录 | 对应模块 |
| -------- | ---- | -------- |
| 1. ChatGPT Mini | `apps/01-chatgpt-mini` | 00、02–04、06、22（最简 UI）；01 为笔记 |
| 2. Tool Agent | `apps/02-tool-agent` | 05、07，回填 10、11 |
| 3. Knowledge Agent | `apps/03-knowledge-agent` | 08、09，回填 17、18 |
| 4. Research Agent | `apps/04-research-agent` | 11–14，回填 19、21 |
| 5. Coding Agent | `apps/05-coding-agent` | 15、16、20，回填 22、23 |

---

## 怎么学

1. 打开 [docs/00-目录.md](docs/00-目录.md)，先读 [怎么用](docs/02-怎么用.md)（含默认选型），再按 [学习路线](docs/03-学习路线.md) 的 24 个模块走（或明确说改走 13 阶段）。
2. 进入 `apps/` 后 `nvm use`（推荐 Node 22；**最低 ≥22**），模型 Key 配 `apps/.env`：`cp apps/.env.example apps/.env`。
3. 对 AI 说 `coach status` 或 `coach start`。它应先报五行：当前模块、**节奏**、当前条目、代码落点、动作。外部学习时 `coach start` 还必须给**出门包**：网上搜什么 + **一整段可复制、拿去问别的 AI 的问题**（不用你再要）。
4. 每个模块打开 [docs/学习模块/](docs/学习模块/README.md) 对应文件夹（`README.md` = 验收 + 小节进度；每小节一个 MD = 笔记）。过没过完看 [学习总览](docs/06-学习总览.md)。有代码则更新该项目 `LEARNING.md`。勾本地前必须写好该模块「本地产出」MD。

常用命令只有三条：`coach status` · `coach start` · `coach next`。讲概念、自测、review、报错排查直接说就行。完整约定在 `AGENTS.md` §6。

技术栈：**TypeScript 5.x + Node.js ≥22** + yarn。模型：**MiniMax / 智谱**（各支持 OpenAI + Anthropic 双协议，同 Key 换 Base URL）+ **Anthropic 官方**。`openai` → 协议 A；`@anthropic-ai/sdk` → 协议 B。Key 在 `apps/.env`。

---

## 当前进度

过没过完、现在学哪一条，以 [学习总览](docs/06-学习总览.md) 和对应模块 README 的**小节进度**为准（不要只看本段）。模块 00 已完成，从 [模块 01](docs/学习模块/01-AI与LLM基础认知/README.md) 接着走。
