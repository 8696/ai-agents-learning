# 01 ChatGPT Mini

- 对应文档模块：00、02、03、04、06、22（最简 UI）
- 本仓库路径：apps/01-chatgpt-mini
- 怎么跑：`yarn install && yarn dev` 或 `yarn dev:anthropic`
- 当前行号地图：[LEARNING.md](./LEARNING.md)（复习看这个；本页只保证「打开能跑」）

## 两个入口（同一 MINIMAX_API_KEY，不同协议）

| 命令 | 文件 | 协议 | SDK | MiniMax 端点 |
| ---- | ---- | ---- | --- | ------------ |
| `yarn dev` | `src/index.ts` | A · OpenAI Chat Completions | `openai` | `api.minimaxi.com/v1` |
| `yarn dev:anthropic` | `src/index-anthropic.ts` | B · Anthropic Messages API | `@anthropic-ai/sdk` | `api.minimaxi.com/anthropic` |

自定义问题：

```bash
yarn dev 什么是 Agent？
yarn dev:anthropic 什么是 Agent？
```

## 环境变量

**模型 Key 在 `apps/.env`**，所有 `apps/*` 子项目共用。

**Node.js ≥22**：在 `apps/` 下执行 `nvm use`（读 `apps/.nvmrc`，推荐 22；更高版本也可以）。

```bash
# 在 apps/ 目录（不是仓库根）
cd apps
nvm use
cp .env.example .env
# 编辑 .env：MINIMAX_API_KEY 必填；协议 B 可选配置 MINIMAX_ANTHROPIC_*

cd 01-chatgpt-mini
yarn install
yarn dev              # 协议 A
yarn dev:anthropic    # 协议 B
```

| 变量 | 协议 A | 协议 B |
| ---- | ------ | ------ |
| `MINIMAX_API_KEY` | ✅ 必填 | ✅ 必填（同一把 Key） |
| `MINIMAX_BASE_URL` / `MINIMAX_MODEL` | ✅ | — |
| `MINIMAX_ANTHROPIC_BASE_URL` / `MINIMAX_ANTHROPIC_MODEL` | — | ✅（有默认值） |

类型检查：`yarn typecheck`

## 当前能做什么

> 回填后**改写**本节（现在能跑什么），不要追加「模块 02 验收」这类历史清单。勾选进度在 [学习总览](../../docs/06-学习总览.md) 和对应模块 README。

- `yarn dev` 流式回复成功（协议 A）
- 控制台能看到 token 用量（或知道去控制台查）
- `apps/.env` 不进 git
- 协议 B 入口已在（`yarn dev:anthropic`），**对照验收在模块 02**，不算模块 00 必过
