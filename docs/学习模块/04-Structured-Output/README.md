[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「模块复盘」MD / `apps/04-Structured-Output/{小节文件夹}/README.md`

# 模块 04 · Structured Output ⭐⭐⭐⭐⭐

[← 03 Prompt Engineering](../03-Prompt-Engineering/README.md) · [05 Tool Calling / Function Calling →](../05-Tool-Calling/README.md)

> **小节进度、验收、动手落点**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/04-Structured-Output/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/04-Structured-Output/{小节文件夹}/`（每条外部小节的最小可运行 Demo；详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行是**模块复盘**（只写 MD，不落代码，[AGENTS.md §7.3](../../../AGENTS.md#73-模块复盘进度表最后一行)）。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ✅ | [**JSON Schema**：类型、optional、enum；Zod 和 Schema 的关系](./01-JSON-Schema.md) | 能读一份 Schema，知道必填 / 枚举 | `JSON Schema tutorial` `zod to json schema` · [json-schema.org](https://json-schema.org) · [Zod 文档](https://zod.dev) | 暂无链接 |
| ⬜ | [**JSON Mode vs Structured Output**：前者保证合法 JSON，后者保证符合 schema](./02-JSON-Mode-vs-Structured-Output.md) | 能说清严格模式多保证了什么 | `OpenAI structured outputs vs json mode` · OpenAI Structured Outputs 文档 | — |
| ⬜ | [**模块复盘**](./03-模块复盘.md) | 本页验收 + 学习沉淀 | — | [沉淀](./03-模块复盘.md) |

## 验收

> 写**模块复盘**时对照本节：复盘的「模块验收对答」表逐条抄这里。
> `coach next` 勾复盘行前走 [AGENTS.md §7.3 闸门](../../../AGENTS.md#73-模块复盘进度表最后一行)（不查代码、不打 Demo 判断块）。

**一句话目标**：让 LLM 从「生成文字」变成「生成程序可以处理的数据」。

**动手产出**：用 Zod 实现意图识别、信息提取、分类器三个功能。

**验收标准**
- [ ] Zod Schema → JSON Schema → 模型 → 解析 → 类型安全的 TS 对象，全链路打通
- [ ] 解析失败时有自动重试（把错误信息回传给模型让它修）
- [ ] 能处理嵌套对象、数组、可选字段、枚举
- [ ] 知道 JSON Mode 和 Structured Output（严格模式）的区别
- [ ] 有一个「模型返回了不合法 JSON」的测试用例并能正确恢复

**自测问题**：为什么要用 Structured Output？如何保证类型安全？模型输出的 JSON 不合法怎么办？

**常见坑**：用正则或 `JSON.parse` 裸解析模型输出，没有 Schema 校验层。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`JSON Schema tutorial` · `structured outputs vs json mode`

## 动手落点

> 落到 `apps/04-Structured-Output/{小节文件夹}/`。

1. 先改 `src/index.ts` 或新建 `src/structured.ts`：Zod schema → 模型 → parse
2. 解析失败把错误回传给模型再试
3. 故意喂不合法 JSON 的用例，确认能恢复
