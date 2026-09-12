# AI Agent 开发 0 → 1 完整学习仓库

24 个模块的学习笔记（`docs/`）+ 唯一代码落点（`apps/`，模块 00 mini-app + 每条外部小节的最小可运行 Demo）。

详细目录 → [docs/00-目录.md](docs/00-目录.md) · 学习协议 → [docs/01-使用协议.md](docs/01-使用协议.md) · 路线 → [docs/03-学习路线.md](docs/03-学习路线.md) · 进度 → [docs/06-学习总览.md](docs/06-学习总览.md)

打开本仓库的 AI **先读 [AGENTS.md](AGENTS.md)**——这是仓库对 Agent 的短契约；细则按需在 `agents/` 里 Read。人类读者可直接看下面的「怎么用」。

---

## 怎么用

1. 按 [docs/06-学习总览.md](docs/06-学习总览.md) 看当前进度
2. 进当前模块 README → [docs/学习模块/](docs/学习模块/)（一模块一文件夹）
3. 跟着「小节进度」从第一条走到最后一行「模块复盘」
4. 每条学完 → 说「沉淀文档」让 Coach 写小节 MD → Demo 判断（说「写 Demo / 不写 Demo」）→ `coach complete`
5. 不写代码也行，只学概念也走通。`coach status` 看当前节奏

`apps/` 是**唯一**的代码落点（[AGENTS.md §5](AGENTS.md#5-demo-落点)）：

- **共享 package**：`apps/package.json` · `apps/llm.ts` · `apps/logger.ts` · `apps/load-root-env.ts` · `apps/.env`（不进 git）· `apps/tsconfig.*`
- **按条小节文件夹**：`apps/{模块文件夹}/{小节文件夹}-step-{N}/`（**扁平结构**，`-step-N` 直接拼到小节名后缀；多 step 是同模块下的兄弟文件夹；N 起步为 1，动态追加）
- 模块 00 mini-app 同样走这套：`apps/00-环境准备/01-mini-app-step-1/`
- 学到该条、[AGENTS.md §5.2](AGENTS.md#52-小节-demo) 判为「可运行」才建；不要提前建空目录
- 已落 Demo 清单 + 端口占用表 → [apps/README.md](apps/README.md)

每个 `apps/` 子文件夹只维护 `README.md`（怎么跑 + 当前能做什么），跟代码一起改写。

---

## 跑起来

```bash
# Node ≥22（apps/.nvmrc 推荐 22）
cd apps
yarn install
cp .env.example .env
# 编辑 apps/.env：填 MINIMAX_API_KEY（模块 00 起；模块 02 再启用智谱 / Anthropic 官方）

# 模块 00 mini-app（HTTP + SSE + 浏览器聊天页，http://127.0.0.1:50000/）
yarn app:00-01-mini-app-step-1

# 模块 00 · 输入/输出 Token 分开
yarn app:00-01-api-key-billing-step-1

# 其它已落 Demo 走同样的 app:{模块两位}-{小节两位}-{英文短名}-step-{N}
# 例：模块 06 · Context vs Memory step-2
yarn app:06-01-context-vs-memory-step-2
```

完整脚本清单 + 端口占用 → [apps/README.md](apps/README.md)。

---

## 仓库约定

- **TS 5 + Node ≥22 + yarn**（[AGENTS.md §5.0](AGENTS.md#50-代码约定node--ts--注释--key--选型)）
- **三家供应商、两种协议、两个 SDK**（[docs/02-怎么用.md §1.2.1](docs/02-怎么用.md)）：
  - 协议 A = `openai` + `/v1` 端点（OpenAI Chat Completions）
  - 协议 B = `@anthropic-ai/sdk` + Messages API（Anthropic 兼容）
  - MiniMax / 智谱同 Key、换 baseURL；Anthropic 官方仅协议 B
- **Zod 守门**（环境变量 + 外部数据）
- **apps/ 子文件夹互不 import**；条与条不互相 import
- **共用 Key 只放 `apps/.env`，不进 git**
- **不抽共享 npm 包**；新建入口复制 `apps/load-root-env.ts`（[AGENTS.md §5.0](AGENTS.md#50-代码约定node--ts--注释--key--选型)）
- **HTTP 端口** 从 `50000` 起顺序分配（`max+1`，不回收）；新建/改口 5 步 checklist → [apps/README.md](apps/README.md)

清进度 / 重学（按需打开，非日常） → [RESET.md](RESET.md)。

---

## 目录

```text
ai-agents-learning/
├── README.md                          ← 本文件
├── AGENTS.md                          ← 仓库对 AI 的短契约（打开必读）
├── CLAUDE.md                          ← Claude Code 入口（@AGENTS.md）
├── RESET.md                           ← 清进度 / 清 apps（按需打开）
├── docs/
│   ├── 00-目录.md · 01-使用协议.md · 02-怎么用.md
│   ├── 03-学习路线.md · 04-自测题库.md · 05-资源清单.md
│   ├── 06-学习总览.md · 07-核心术语.md
│   └── 学习模块/                      ← 一模块一文件夹（00 ~ 23）
│       ├── 00-环境准备/README.md · 01-*.md · ... · 04-模块复盘.md
│       ├── 01-AI与LLM基础认知/...
│       └── ...（到 23-Production-Agent-Architecture）
├── agents/                            ← 陪跑细则（按需 Read，不自动注入）
│   ├── 00-mode.md · 03-progress.md · 04-pitfalls.md
│   ├── 05-demo.md · 06-teach.md · 06-outing.md
│   └── 07-notes.md · 07-review.md
├── apps/                              ← 唯一代码落点（共享 package）
│   ├── README.md · package.json · tsconfig.json · tsconfig.base.json
│   ├── llm.ts · logger.ts · load-root-env.ts
│   ├── .env.example · .nvmrc · .env（Key，不进 git）
│   ├── 00-环境准备/01-mini-app-step-1/ · 01-API-Key-计费-step-1/
│   ├── 01-AI与LLM基础认知/02-Token-step-1/ · 06-Embedding-step-1/ · 07-Temperature-Top-P-step-1/
│   ├── 02-LLM-API开发/01-Streaming-SSE-step-1/ · 02-协议-A-vs-B-step-1/ · 03-{adapter,AbortController}-step-1/ · 04-Rate-Limit-step-1/ · 05-思考-step-1/
│   ├── 03-Prompt-Engineering/01-System-User-Assistant-优先级-step-1/ · 02-Few-shot-Zero-shot-step-1/ · 04-Prompt-版本管理-step-1/
│   ├── 04-Structured-Output/01-JSON-Schema-step-1/ · 02-JSON-Mode-vs-{Structured-Output,Tool-Use-ProtoB}-step-1/
│   ├── 05-Tool-Calling/01-Function-Calling-协议-step-1~8/ · 02-Tool-Description-step-1~6/ · 03-Tool-Choice-step-1~3/ · 04-Tool-Gateway-幂等-step-1~4/
│   ├── 06-多轮对话与Context/01-Context-vs-Memory-step-1~2/ · 02-压缩-摘要-vs-滑动窗口-step-1~5/ · 03-Token-Budget-step-1~4/
│   └── ...（学到哪条、§5.2 判为可运行才建；最终模块 23）
└── scripts/                           ← 工具脚本（check-demo / gen-manifest / start-all-demo / static-server）
```

---

## 关键链接

- **[AGENTS.md](AGENTS.md)** — 仓库对 AI 的短契约（**打开本仓库的 AI 必读**）
- **[docs/06-学习总览.md](docs/06-学习总览.md)** — 进度总表
- **[docs/学习模块/](docs/学习模块/)** — 每个模块的 README + 小节 MD
- **[apps/README.md](apps/README.md)** — 已落 Demo 清单 + 端口占用表
- **[RESET.md](RESET.md)** — 清空与重置（按需打开，非日常）
