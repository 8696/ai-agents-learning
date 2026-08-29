[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / 项目 LEARNING.md

# 模块 12 · MCP ⭐⭐⭐⭐⭐

[← 11 Agent State / Workflow](../11-Agent-State-Workflow/README.md) · [13 Agent Framework →](../13-Agent-Framework/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」仍以项目 `LEARNING.md` 为准（行号会变）。
> **项目当前地图**：`apps/04-research-agent/LEARNING.md`

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。

| 状态 | 重点（学什么） | 够用就算过 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**MCP 架构**：Client / Server；Tool、Resource、Prompt 三种原语](./01-MCP-架构.md) | 能说清谁连谁、三种原语各干什么 | `Model Context Protocol architecture` `MCP tool resource prompt` · [modelcontextprotocol.io](https://modelcontextprotocol.io) 官方文档 | — |
| ⬜ | [**stdio vs Streamable HTTP**：本地玩具 vs 远程 + 按用户鉴权](./02-stdio-vs-Streamable-HTTP.md) | 知道生产形态为什么不是 stdio | `MCP stdio transport` `MCP streamable HTTP` `MCP OAuth 2.1` · MCP 规范 Transport / Authorization | — |
| ⬜ | [**Skills vs MCP**：MCP 是连工具的协议；Skills / AGENTS.md 是打包领域行为](./03-Skills-vs-MCP.md) | 能一句话划界，不混成一个东西 | `Claude agent skills` `AGENTS.md vs MCP` · Anthropic Skills · 本仓库 AGENTS.md | — |
| ⬜ | [**本地产出**](./04-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：理解 Agent 如何标准化地连接外部工具和服务。

**动手产出**：用 TypeScript + Node.js 自己写一个 MCP Server，并用 Client 接入自己的 Agent。

**验收标准**
- [ ] 能说清 MCP 的三个核心原语：Tool、Resource、Prompt，各自的用途
- [ ] 自己写的 MCP Server 至少暴露 2 个 Tool 和 1 个 Resource
- [ ] **stdio（开发）和 Streamable HTTP（生产形态）两种 Transport 都跑通过**
- [ ] HTTP 形态有鉴权：至少 API Token；能讲清生产上常用 **OAuth 2.1 + 按用户隔离**（概念必须有，实现可最简）
- [ ] 自己的 Agent 作为 MCP Client 能发现并调用远端 Tool
- [ ] 把自己的 MCP Server 接进 Cursor / Claude Code / Codex / Claude Desktop（任选其一）实际用起来
- [ ] 能说清 MCP 和「直接写 Tool」相比多解决了什么问题
- [ ] 能区分 **MCP vs Skills**：MCP 是工具/数据协议；Skills / `AGENTS.md` / `SKILL.md` 是领域知识与行为打包，避免把说明书全塞进 System Prompt

**自测问题**：MCP 解决了什么问题？Tool 和 Resource 的区别？stdio 玩具和远程 MCP 差在哪？MCP 和 Skills 各管哪一层？

**常见坑**：把 MCP 当成「一种新的 Tool Calling 写法」。它的价值在于**解耦和复用**：工具提供方和 Agent 开发者可以是不同的人/组织。另一坑：只做 stdio，讲不清「用户怎么登录、工具怎么按身份鉴权」。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`Model Context Protocol` · `MCP streamable HTTP` · `MCP OAuth` · `agent skills vs MCP`

## 本地拆步

> `apps/04-research-agent`：没有就新建（先问）并复制 `load-root-env.ts`。

1. 自写 MCP Server：≥2 个 Tool + 1 个 Resource
2. 先 stdio，再 Streamable HTTP（至少 API Token 鉴权）
3. 本项目 Agent 当 Client 调通；再接进 Cursor / Claude Code / Codex 之一
