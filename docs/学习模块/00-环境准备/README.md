[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见 [apps/00-环境准备/01-mini-app/README.md](../../../apps/00-环境准备/01-mini-app/README.md)

# 模块 00 · 环境准备 ⭐⭐⭐⭐⭐

（无上一模块） · [01 AI & LLM 基础认知 →](../01-AI与LLM基础认知/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/00-环境准备/01-mini-app/README.md` 为准。
> **代码落点**：[apps/00-环境准备/01-mini-app/README.md](../../../apps/00-环境准备/01-mini-app/README.md)（模块 00 本地产出 Demo APP = mini-app 三入口；按条另有 [API Key 计费](../../../apps/00-环境准备/01-API-Key-计费/)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是本模块小 APP（把已学能力串起来，不 import 其它小节），不是再讲一节新概念、也不是从零灌代码（[AGENTS.md §5.4](../../../AGENTS.md#54-模块小-app本地产出行)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ✅ | [**API Key / 计费**：按 Token 计费，输入 / 输出分开；订阅 Key ≠ 按量 API Key](./01-API-Key-计费.md) | 能说清差别，知道去控制台看账单 | `LLM API pricing tokens` `MiniMax 按量计费` `API key vs subscription key` · [MiniMax 控制台](https://platform.minimaxi.com) 计费说明 · 各厂商 Pricing 页 | — |
| ✅ | [**Node ≥22**：最低 22，不锁死小版本；换机器怎么对齐](./02-Node-22.md) | 会 `nvm use`，知道 `engines: ">=22"` 只拦低于 22 的 | `nvm node version` `engines field package.json` · [Node.js 22 文档](https://nodejs.org/docs/latest-v22.x/api/index.html) · nvm README | — |
| ✅ | [**密钥安全**：泄露后第一件事是 rotate，不是只改 `.gitignore`](./03-密钥安全.md) | 能说出泄露后的第一时间动作 | `git secret scanning` `accidentally committed api key` · GitHub Secret Scanning 说明 · OWASP 密钥管理 | — |
| ✅ | [**本地产出**](./04-本地产出.md) | 打开 mini-app 能发消息、拿流式回复、看见 usage；Key 不进 git | — | [沉淀](./04-本地产出.md) · [apps mini-app README](../../../apps/00-环境准备/01-mini-app/README.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：让「我想试一下这个想法」到「代码跑起来」的距离缩短到 30 秒。

**动手产出**：把本模块已落代码整合成 **一份 Demo APP** = `apps/00-环境准备/01-mini-app/`（不另建 `04-本地产出/`）。浏览器 `yarn app:00-01-mini-server`（端口 `50000`）发一条消息拿到流式回复并看见用量；CLI `yarn app:00-01-mini-cli-a` 是同一套链路的终端入口。按条 Demo `yarn app:00-01-api-key-billing` 仍单独验证「输入/输出 Token 分开计费」。

**验收标准**
- [x] 浏览器打开 Demo APP（`http://127.0.0.1:50000/`）能发消息并逐字看到流式回复
- [x] **一家**模型（OpenAI 兼容即可）成功发出请求，并拿到**流式**回复
- [x] `.env` 不在 git 里，且有 `.env.example`（只列 Key 名，不填真实值；本仓库放在 `apps/`）
- [x] 能在控制台 / 页面看到本次请求的用量；知道去哪里看账号花费
- [x] `yarn app:00-01-mini-cli-a` 一条命令就能跑起来
- [x] 主路径只跑 MiniMax 协议 A；未把智谱专属 SDK、Agent 框架、向量库打进本模块主路径。协议 B（`@anthropic-ai/sdk`）若已提前存在，**不作为本模块失败条件**，对照留模块 02

**自测问题**：你怎么管理多环境的 API Key？如何避免密钥泄漏进仓库？模块 00 为什么先只接一家？

**常见坑**
- 把 Key 硬编码进代码然后推到公开仓库（会在几分钟内被扫走并跑爆额度）。
- 一上来装三家客户端、建多个 mini-app。「账号可以三家都注册」≠「模块 00 代码要三家都接上」。智谱放到模块 02。协议 B 若提前加了，主路径仍以协议 A 为准。
- MiniMax 用了海外站域名 `*.minimax.io`，或把 Token Plan 订阅 Key 当成按量 API Key 用。
- 本机 Node **低于 22** 时，`engines` 会拦住 `yarn app:...`；在 `apps/` 下 `nvm use`（读 `apps/.nvmrc`）后跑。22 及以上（含 24）都可以。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`LLM API pricing` · `git secret scanning`

## 本地拆步

> 本地产出 = 把本模块代码整合成 Demo APP。本模块的 APP 就是 mini-app，不另建文件夹。

1. Demo APP（浏览器）：`yarn app:00-01-mini-server` → `http://127.0.0.1:50000/`
2. 同一链路 CLI：`yarn app:00-01-mini-cli-a`；协议 B 入口可超前，不算本模块验收
3. 按条计费 Demo 仍用 `yarn app:00-01-api-key-billing`（不 import 进 mini-app）
4. 共用 `apps/load-root-env.ts` / `apps/llm.ts` 读 `apps/.env`
