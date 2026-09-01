[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / 项目 LEARNING.md

# 模块 00 · 环境准备 ⭐⭐⭐⭐⭐

（无上一模块） · [01 AI & LLM 基础认知 →](../01-AI与LLM基础认知/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」仍以项目 `LEARNING.md` 为准（行号会变）。
> **项目当前地图**：[LEARNING.md](../../../apps/01-chatgpt-mini/LEARNING.md)

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo与五个项目分离)）以及要不要把本条增量回填进五个项目（[§5.3](../../../AGENTS.md#53-五个项目按条增量回填本地产出是收口)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ✅ | [**API Key / 计费**：按 Token 计费，输入 / 输出分开；订阅 Key ≠ 按量 API Key](./01-API-Key-计费.md) | 能说清差别，知道去控制台看账单 | `LLM API pricing tokens` `MiniMax 按量计费` `API key vs subscription key` · [MiniMax 控制台](https://platform.minimaxi.com) 计费说明 · 各厂商 Pricing 页 | — |
| ✅ | [**Node ≥22**：最低 22，不锁死小版本；换机器怎么对齐](./02-Node-22.md) | 会 `nvm use`，知道 `engines: ">=22"` 只拦低于 22 的 | `nvm node version` `engines field package.json` · [Node.js 22 文档](https://nodejs.org/docs/latest-v22.x/api/index.html) · nvm README | — |
| ✅ | [**密钥安全**：泄露后第一件事是 rotate，不是只改 `.gitignore`](./03-密钥安全.md) | 能说出泄露后的第一时间动作 | `git secret scanning` `accidentally committed api key` · GitHub Secret Scanning 说明 · OWASP 密钥管理 | — |
| ✅ | [**本地产出**](./04-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-本地产出.md) · [LEARNING.md](../../../apps/01-chatgpt-mini/LEARNING.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：让「我想试一下这个想法」到「代码跑起来」的距离缩短到 30 秒。

**动手产出**：最小可运行的 TS 项目（`tsx` / `dotenv` / `zod` + **一家**模型 SDK）+ 学习专用 GitHub 仓库。跑通「发出去一条消息、拿到流式回复」。

**验收标准**
- [x] **一家**模型（OpenAI 兼容即可）成功发出请求，并拿到**流式**回复
- [x] `.env` 不在 git 里，且有 `.env.example`（只列 Key 名，不填真实值；本仓库放在 `apps/`）
- [x] 能在控制台看到本次请求的用量；知道去哪里看账号花费
- [x] `yarn dev` 一条命令就能跑起来
- [x] 主路径只跑 MiniMax 协议 A（`yarn dev`）；未把智谱专属 SDK、Agent 框架、向量库打进本模块主路径。协议 B（`@anthropic-ai/sdk`）若已提前存在，**不作为本模块失败条件**，对照留模块 02

**自测问题**：你怎么管理多环境的 API Key？如何避免密钥泄漏进仓库？模块 00 为什么先只接一家？

**常见坑**
- 把 Key 硬编码进代码然后推到公开仓库（会在几分钟内被扫走并跑爆额度）。
- 一上来装三家客户端、建五个空项目。「账号可以三家都注册」≠「模块 00 代码要三家都接上」。智谱放到模块 02。协议 B 若提前加了，主路径仍以 `yarn dev`（协议 A）为准。
- MiniMax 用了海外站域名 `*.minimax.io`，或把 Token Plan 订阅 Key 当成按量 API Key 用。
- 本机 Node **低于 22** 时，`engines` 会拦住 `yarn dev`；在 `apps/` 下 `nvm use` 后再跑子项目。22 及以上（含 24）都可以。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`LLM API pricing` · `git secret scanning`

## 本地拆步

> 节奏变成「本地产出」时按这个顺序改；先改的文件写在第一条。本模块已完成，留给对照。

1. `apps/01-chatgpt-mini/src/index.ts`：读 `apps/.env` → Zod → 流式打印
2. 共用 `src/load-root-env.ts` 指向 `apps/.env`（新建 app 时复制此文件）
3. `yarn dev` 跑通协议 A；协议 B 入口可超前，不算本模块验收
