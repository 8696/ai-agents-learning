[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「模块复盘」MD / `apps/16-Coding-Agent/{小节文件夹}/README.md`

# 模块 16 · Coding Agent ⭐⭐⭐⭐⭐

[← 15 Browser / Computer Agent](../15-Browser-Computer-Agent/README.md) · [17 Agent Evaluation →](../17-Agent-Evaluation/README.md)

> **小节进度、验收、动手落点**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/16-Coding-Agent/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/16-Coding-Agent/{小节文件夹}/`（详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行是**模块复盘**（只写 MD，不落代码，[AGENTS.md §7.3](../../../AGENTS.md#73-模块复盘进度表最后一行)）。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**产品形态**：文件 Tool + Shell + Git（+ 测试）组成编码循环](./01-产品形态.md) | 能对标 Cursor / Claude Code / Codex（以及 Aider）的能力块 | `AI coding agent architecture` `sandbox code execution agent` · Cursor / Claude Code / Codex / Aider 公开介绍 | — |
| ⬜ | [**精确编辑 vs 整文件重写**：为什么生产里要用 patch / diff](./02-精确编辑-vs-整文件重写.md) | 能说出整文件重写会踩什么坑 | `search replace edit LLM code` `unified diff agent` · 开源 Coding Agent README | — |
| ⬜ | [**AGENTS.md / Skills**：用文档约束 Agent 行为，不是再写一套 MCP](./03-AGENTS-Skills.md) | 知道「规则文件」和「工具协议」的分工 | `AGENTS.md` `Claude Code SKILL.md` `Codex AGENTS.md` · Anthropic Skills · Cursor / Claude Code / Codex 的仓库规则文件 | — |
| ⬜ | [**模块复盘**](./04-模块复盘.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-模块复盘.md) |

## 验收

> 写**模块复盘**时对照本节：复盘的「模块验收对答」表逐条抄这里。
> `coach complete` 勾复盘行前走 [AGENTS.md §7.3 闸门](../../../AGENTS.md#73-模块复盘进度表最后一行)（不查代码、不打 Demo 判断块）。

**一句话目标**：做一个 Mini Coding Agent，对标 Cursor / Claude Code / Codex 这类产品的核心能力块——非常适合你的程序员背景。

**动手产出**：一个能读代码、改代码、跑测试、提交 Git 的 Coding Agent。

**验收标准**
- [ ] 实现了文件 Tool：read / write / list / search（grep）
- [ ] 实现了 Shell Tool，并且**有命令白名单或人工确认**
- [ ] 实现了 Git Tool：diff / status / commit
- [ ] 能完成一个真实小任务：「给这个函数加单元测试并跑通」
- [ ] 有 Sandbox 或工作目录限制，Agent 不能碰工作目录之外的文件
- [ ] 危险操作（删除、force push、修改配置）必须人工确认
- [ ] 修改文件前有备份或依赖 Git 保护
- [ ] 仓库里有一份 **`AGENTS.md` 或 `SKILL.md`**，用来约束 Coding Agent 的行为（工作目录、禁止事项、怎么改文件）；能讲清它和 MCP 的差别

**自测问题**：Coding Agent 的权限边界怎么设计？如何让 Agent 精确编辑文件而不是整文件重写？Shell Tool 的安全风险有哪些？Skills / AGENTS.md 解决什么问题？

**常见坑**：让 Agent 整个文件重写，导致丢失无关代码。应该用**精确的 diff / 字符串替换**方式编辑。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`coding agent architecture` · `search replace edit LLM`

## 动手落点

> 落到 `apps/16-Coding-Agent/{小节文件夹}/`。

1. 文件 Tool（read / write / list / grep）+ 受限 Shell + Git
2. 用 patch / 替换改文件，不要整文件重写；工作目录之外碰不到
3. 仓库内放 `AGENTS.md` 或 `SKILL.md` 约束行为；危险操作 HITL
