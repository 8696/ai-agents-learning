# AI Agent 开发 0 → 1 完整学习仓库

24 个模块的学习笔记 + apps/ 唯一代码落点（模块 00 mini-app + 每条外部小节的最小可运行 Demo）。

详细目录 → [docs/00-目录.md](docs/00-目录.md)。学习协议 → [docs/01-使用协议.md](docs/01-使用协议.md)。路线 → [docs/03-学习路线.md](docs/03-学习路线.md)。

## 怎么用

1. 按 [docs/06-学习总览.md](docs/06-学习总览.md) 看当前进度
2. 找到当前模块的 README → [docs/学习模块/](docs/学习模块/)
3. 跟着「小节进度」从外部第一条走到本地产出
4. 每条学完 → 写小节 MD（说「沉淀文档」）→ Demo 判断（说「写 Demo / 不写 Demo」）→ `coach next`
5. 不写代码？只学概念也行。`coach status` 看当前节奏

`apps/` 是**唯一**的代码落点（[AGENTS.md §4](AGENTS.md#4-代码落点)）：
- 模块 00 mini-app：`apps/00-环境准备/01-mini-app/`
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
yarn app:00-01-mini-cli-a          # CLI 协议 A（流式）
yarn app:00-01-mini-cli-b          # CLI 协议 B（对照）
yarn app:00-01-mini-server         # HTTP + SSE + 浏览器聊天页（http://127.0.0.1:3000/）

# 其它入口（按 docs/学习模块/README.md 里的小节）
yarn app:01-02-token               # 例：模块 01 · Token
yarn app:02-01-streaming-sse       # 例：模块 02 · Streaming/SSE
```

## 仓库约定

- **TS 5 + Node ≥22 + yarn**（[AGENTS.md §5.0](AGENTS.md#50-代码落点规范node--ts--注释--key--选型)）
- **Zod 守门**（环境变量 + 外部数据）
- **apps/ 子文件夹互不 import**
- **协议 A = OpenAI Chat Completions**；**协议 B = Anthropic Messages**；同 Key 换 baseURL
- 共用 Key 只放 `apps/.env`，不进 git

不抽共享 npm 包（[AGENTS.md §5.0](AGENTS.md#50-代码落点规范node--ts--注释--key--选型)）；新建入口时复制 `apps/load-root-env.ts`。

## 目录

```text
ai-agents-learning/
├── README.md · AGENTS.md · RESET.md
├── docs/
│   ├── 00-目录.md · 01-使用协议.md · 02-怎么用.md
│   ├── 03-学习路线.md · 04-自测题库.md · 05-资源清单.md
│   ├── 06-学习总览.md · 07-核心术语.md
│   └── 学习模块/                    ← 一模块一文件夹
│       ├── 00-环境准备/README.md · 01-{小节}.md · ... · 04-本地产出.md
│       ├── 01-AI与LLM基础认知/README.md · 01~11-*.md
│       └── ...（到 23）
├── apps/
│   ├── README.md · package.json · tsconfig.json · tsconfig.base.json
│   ├── load-root-env.ts · .env.example · .nvmrc · .env（Key，不进 git）
│   ├── 00-环境准备/01-mini-app/        ← 模块 00 mini-app（三入口）
│   ├── 01-AI与LLM基础认知/01-API-Key-计费/
│   ├── 02-LLM-API开发/01-Streaming-SSE/ · 02-协议-A-vs-B/ · 03-AbortController/ · 04-Rate-Limit/
│   └── ...（学到哪条建哪条）
└── RESET.md                          ← 清进度 / 清 apps（按需打开，非日常）
```

学完所有模块后想要作品集再从零建（[AGENTS.md §5](AGENTS.md#5-demo-落点)）。

## 学习总览（截至模块 00）

| 模块 | 状态 | 内容 |
| ---- | ---- | ---- |
| 00 | ✅ 完成 | 环境准备 / Key 安全 / Node ≥22 / 本地产出 |
| 01 | ✅ 完成 | Token / Context / Transformer / 幻觉 |
| 02 | ✅ 完成 | Streaming · 协议 A/B · AbortController · Rate-Limit |
| 03 ~ 23 | ⬜ | 见 [docs/06-学习总览.md](docs/06-学习总览.md) |

## 关键链接

- [AGENTS.md](AGENTS.md) — 仓库操作契约（**打开本仓库的 AI 必读**）
- [docs/06-学习总览.md](docs/06-学习总览.md) — 进度总表
- [docs/学习模块/](docs/学习模块/) — 每个模块的 README + 小节 MD
- [apps/README.md](apps/README.md) — 现有入口与跑法
