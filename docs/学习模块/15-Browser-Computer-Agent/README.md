[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/15-Browser-Computer-Agent/01-{短名}/README.md`

# 模块 15 · Browser / Computer Agent ⭐⭐⭐⭐⭐

[← 14 Multi-Agent](../14-Multi-Agent/README.md) · [16 Coding Agent →](../16-Coding-Agent/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/15-Browser-Computer-Agent/01-{短名}/README.md` 为准。
> **代码落点**：`apps/15-Browser-Computer-Agent/01-{短名}/`（每条外部小节的最小可运行 Demo；详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**Accessibility Tree**：给 LLM 的页面摘要，通常比 DOM 短、噪音少](./01-Accessibility-Tree.md) | 知道为什么优先 a11y 而不是塞整个 HTML | `accessibility tree browser automation` `playwright accessibility snapshot` · [Playwright 文档](https://playwright.dev/docs/aria-snapshots) · Chrome DevTools a11y | — |
| ⬜ | [**Computer Use**：比「只开浏览器」范围大（桌面），权限和风险更高](./02-Computer-Use.md) | 能说出和 Browser Agent 的差别 | `Claude computer use` `GUI agent LLM` · Anthropic Computer Use 文档 | — |
| ⬜ | [**本地产出**](./03-本地产出.md) | 本页验收 + 学习沉淀（新建 `05-coding-agent`） | — | [沉淀](./03-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：让 Agent 真正操作网页。

**动手产出**：一个 Browser Agent（Playwright + 自研 Tool）。

**验收标准**
- [ ] 封装了基础 Tool：navigate / click / type / extract / screenshot
- [ ] 用 Accessibility Tree 而不是原始 DOM 给模型描述页面（Token 省一个数量级）
- [ ] 能完成一个多步骤真实任务（比如搜索 → 筛选 → 提取结果 → 汇总）
- [ ] 处理了动态加载、等待元素、超时
- [ ] 失败时能截图并让模型基于截图重新规划

**自测问题**：为什么用 Accessibility Tree 而不是 DOM？Browser Agent 的可靠性瓶颈在哪？

**常见坑**：把整个 HTML 塞给模型，一个页面 10 万 Token，又贵又不准。**你的前端背景在这里是巨大优势**，你知道页面结构该怎么抽取。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`accessibility tree playwright` · `computer use agent`

## 本地拆步

> 新建 `apps/15-Browser-Computer-Agent/01-{短名}/`（先按 [AGENTS.md §5.2 可运行 Demo 怎么建](../../../AGENTS.md#52-小节-demo) 的流程来；用到 LLM 时共用 `apps/load-root-env.ts`）。

1. Playwright Tools：navigate / click / type / extract / screenshot
2. 用 Accessibility Tree 描述页面，不要塞整个 HTML
3. 一条多步骤真实任务；失败时截图再规划
