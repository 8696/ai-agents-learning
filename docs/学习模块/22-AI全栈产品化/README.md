[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/22-AI全栈产品化/{小节文件夹}/` README

# 模块 22 · AI 全栈产品化 ⭐⭐⭐⭐⭐

[← 21 后端 & 基础设施](../21-后端与基础设施/README.md) · [23 Production Agent Architecture →](../23-Production-Agent-Architecture/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/22-AI全栈产品化/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/22-AI全栈产品化/{小节文件夹}/`（每条外部小节的最小可运行 UI Demo）。模块 00 mini-app 的最简流式 UI 在 `apps/00-环境准备/01-mini-app/`。

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**流式 Markdown**：边到边渲染会闪、标题/列表会跳动](./01-流式-Markdown.md) | 知道常见原因（不完整语法） | `streaming markdown react` `incremental markdown render` · Vercel AI SDK UI · `react-markdown` issue 讨论 | — |
| ⬜ | [**Agent Steps UI**：思考中 / 正在调工具 / 完成，要让人看懂 Agent 在干什么](./02-Agent-Steps-UI.md) | 能画出三种状态的界面 | `AI agent UI design steps` `tool call status UI` · ChatGPT / Claude / Cursor / Claude Code / Codex 产品截图分析 | — |
| ⬜ | [**本地产出**](./03-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./03-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：把 Agent 的执行过程完整、清晰地呈现给用户。

**动手产出**：每条外部小节在 `apps/22-AI全栈产品化/0X-XX/` 落最小可运行 UI Demo。最简流式 Chat UI 复用模块 00 mini-app（`apps/00-环境准备/01-mini-app/`）；Agent Steps / HITL / 错误 UI / 流式 Markdown 落在本模块的小节 Demo。

**验收标准**（最简版勾在 `01`，打磨项勾在 `05`）
- [ ] （01）流式输出能逐字出现，并能中断生成
- [ ] （05）流式 Markdown 渲染（含代码高亮），不闪烁不跳动
- [ ] （05）**Agent Steps 可视化**：把执行轨迹展示给用户，工具调用状态实时更新
- [ ] （05）引用来源可点击跳转
- [ ] （05）文件上传 + 解析
- [ ] （05）Human Approval 的交互设计（弹窗确认、可修改参数后继续）
- [ ] （05）完善的错误 UI：限流、超时、模型拒答各有对应提示
- [ ] （01 或 05）支持中断生成
- [ ] （05）移动端可用
- [ ] （05）有 Loading / 骨架屏 / 乐观更新等前端细节

**自测问题**：流式 UI 有哪些性能坑？如何设计 Agent 执行过程的可视化？前端如何处理 Agent 的中间状态？

**常见坑**：把 Agent 做成一个只能看到最终答案的黑盒。**Agent 产品的核心体验就是「让用户看见它在做什么」**，这一点做好了，产品感立刻上一个台阶。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`streaming markdown react` · `agent steps UI design`

## 本地拆步

> 落到 `apps/22-AI全栈产品化/0X-XX/` 各小节，最简流式 Chat UI 复用模块 00 mini-app。

1. `apps/00-环境准备/01-mini-app/`：最简流式 Chat 页（逐字出现、能取消；模块 00 已落）
2. `apps/22-AI全栈产品化/01-流式-Markdown/`：流式 Markdown 渲染（不闪烁不跳动）
3. `apps/22-AI全栈产品化/02-Agent-Steps-UI/`：Agent Steps / HITL / 错误 UI
4. 引用、上传、移动端、骨架屏只打磨进对应小节 Demo
