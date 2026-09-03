# AI Agent 开发 0 → 1 完整学习仓库

24 个模块的学习笔记 + apps/ 唯一代码落点（模块 00 mini-app + 每条外部小节的最小可运行 Demo）。

详细目录 → [docs/00-目录.md](docs/00-目录.md)。学习协议 → [docs/01-使用协议.md](docs/01-使用协议.md)。路线 → [docs/03-学习路线.md](docs/03-学习路线.md)。

## 怎么用

1. 按 [docs/06-学习总览.md](docs/06-学习总览.md) 看当前进度
2. 找到当前模块的 README → [docs/学习模块/](docs/学习模块/)
3. 跟着「小节进度」从外部第一条走到最后一行「模块复盘」
4. 每条学完 → 写小节 MD（说「沉淀文档」）→ Demo 判断（说「写 Demo / 不写 Demo」）→ `coach next`
5. 不写代码？只学概念也行。`coach status` 看当前节奏

`apps/` 是**唯一**的代码落点（[AGENTS.md §4](AGENTS.md#4-代码落点)）：
- 模块 00 mini-app：`apps/00-环境准备/01-mini-app-step-1/`
- 各外部小节 Demo：`apps/{模块}/{小节}/`（按 §5.2 判断要不要建）

每个 `apps/` 子文件夹只保持 `README.md`（怎么跑 + 当前能做什么），跟代码一起改写。

## 跑起来

```bash
# Node ≥22；apps/.nvmrc 推荐 22
cd apps
nvm use
yarn install
cp .env.example .env
# 编辑 apps/.env：填 MINIMAX_API_KEY

# 模块 00 mini-app
yarn app:00-01-mini-app-step-1     # HTTP + SSE + 浏览器页（http://127.0.0.1:50000/）

# 其它入口（按 docs/学习模块/README.md 里的小节）
yarn app:01-02-token-step-1       # 例：模块 01 · Token
yarn app:02-01-streaming-sse-step-1 # 例：模块 02 · Streaming/SSE
```

## 仓库约定

- **TS 5 + Node ≥22 + yarn**（[AGENTS.md §5.0](AGENTS.md#50-代码落点规范node--ts--注释--key--选型)）
- **Zod 守门**（环境变量 + 外部数据）
- **apps/ 子文件夹互不 import**
- **协议 A = OpenAI Chat Completions**；**协议 B = Anthropic Messages**；同 Key 换 baseURL
- 共用 Key 只放 `apps/.env`，不进 git

不抽共享 npm 包（[AGENTS.md §5.0](AGENTS.md#50-代码落点规范node--ts--注释--key--选型)）；新建入口时复制 `apps/load-root-env.ts`。

## 换模型 / 换提供商

模型与提供商是**动态可配**的——不需要改 Demo 代码，只改 `apps/.env`：

| 想做什么 | 改 `apps/.env` 哪一行 |
| -------- | --------------------- |
| 换一家提供商（MiniMax / 智谱 / 自定义网关 / 你新加的） | 顶层 `LLM_PROVIDER=...` |
| 在当前提供商下换一个模型 id（协议 A/B 同时生效） | 顶层 `LLM_MODEL=...`（留空则用该家默认） |
| 换当前提供商的 Key / Base URL | 改对应分组：`MINIMAX_*` / `ZHIPU_*` / `CUSTOM_*` |
| 新增一家提供商 | `apps/llm.ts` 的 `CATALOG` 加项 + `apps/.env.example` 加段，详见 [AGENTS.md §5.0.x](AGENTS.md#50x-扩展-llm-提供商catalog) |

完整变量分组 / 默认 Base URL 见 [apps/.env.example](apps/.env.example)；矩阵见 [docs/02-怎么用.md §1.2.1](docs/02-怎么用.md#122-模型供应商速查本仓库固定)。

## 目录

```text
ai-agents-learning/
├── README.md · AGENTS.md · CLAUDE.md · RESET.md
├── agents/                          ← 讲课 / Demo / 出门包 / 沉淀细则（按需 Read）
├── docs/
│   ├── 00-目录.md · 01-使用协议.md · 02-怎么用.md
│   ├── 03-学习路线.md · 04-自测题库.md · 05-资源清单.md
│   ├── 06-学习总览.md · 07-核心术语.md
│   └── 学习模块/                    ← 一模块一文件夹
│       ├── 00-环境准备/README.md · 01-{小节}.md · ... · 04-模块复盘.md
│       ├── 01-AI与LLM基础认知/README.md · 01~11-*.md
│       └── ...（到 23）
├── apps/
│   ├── README.md · package.json · tsconfig.json · tsconfig.base.json
│   ├── load-root-env.ts · .env.example · .nvmrc · .env（Key，不进 git）
│   ├── 00-环境准备/01-mini-app-step-1/        ← 模块 00 mini-app（HTTP + SSE）
│   ├── 01-AI与LLM基础认知/02-Token-step-1/ · 06-Embedding/ · 07-Temperature-Top-P/
│   ├── 02-LLM-API开发/01-Streaming-SSE-step-1/ · 02-协议-A-vs-B/ · 03-AbortController/ · 04-Rate-Limit/
│   └── ...（学到哪条、§5.2 判为可运行才建）
└── RESET.md                          ← 清进度 / 清小节 Demo（共享 package 保留；按需打开，非日常）
```

学完所有模块后想要作品集再从零建（[AGENTS.md §5](AGENTS.md#5-demo-落点)）。

## 关键链接

- [AGENTS.md](AGENTS.md) — 仓库操作契约（**Cursor / Codex 入口**；细则在 [agents/](agents/)）
- [CLAUDE.md](CLAUDE.md) — **Claude Code 入口**（`@AGENTS.md`，不重复写规则）
- [docs/06-学习总览.md](docs/06-学习总览.md) — 进度总表
- [docs/学习模块/](docs/学习模块/) — 每个模块的 README + 小节 MD
- [apps/README.md](apps/README.md) — 现有入口与跑法
