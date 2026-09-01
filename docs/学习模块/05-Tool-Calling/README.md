[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/05-Tool-Calling/{小节文件夹}/README.md`

# 模块 05 · Tool Calling / Function Calling ⭐⭐⭐⭐⭐

[← 04 Structured Output](../04-Structured-Output/README.md) · [06 多轮对话 & Context Engineering →](../06-多轮对话与Context/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/05-Tool-Calling/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/05-Tool-Calling/{小节文件夹}/`（学到再建；详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**Function Calling 协议**：model → tool_call → execute → tool_result → model](./01-Function-Calling-协议.md) | 能画出这一圈，含并行调用 | `OpenAI function calling guide` `Anthropic tool use` `parallel function calling` · 资源清单里的厂商 Tool 文档 | — |
| ⬜ | [**Tool Description**：description / schema 影响模型**何时**调用](./02-Tool-Description.md) | 知道写不好就会乱调或不调 | `writing good tool descriptions LLM` `tool schema best practices` · Anthropic Tool Use 最佳实践章节 | — |
| ⬜ | [**Tool Choice**：auto / none / required 各适合什么](./03-Tool-Choice.md) | 能举三种模式的使用场景 | `tool_choice openai` `force tool call` · 官方 API 参考 | — |
| ⬜ | [**Tool Gateway / 幂等**：请求 ≠ 执行；有副作用的 Tool 必须可重试](./04-Tool-Gateway-幂等.md) | 知道执行前要鉴权 / 校验 | `idempotent API tool calling` `LLM tool permission gateway` · 模块 20 安全卡片 | — |
| ⬜ | [**本地产出**](./05-本地产出.md) | 本页验收 + 学习沉淀（落 `apps/05-Tool-Calling/{小节文件夹}/`） | — | [沉淀](./05-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：这是 Agent 最重要的前置知识——让模型能决定「我需要调用外部能力」。

**动手产出**：实现 calculator / weather / search / database 等 3–4 个 Tool，跑通完整调用闭环。

**验收标准**
- [ ] 有一个 Tool Registry（注册表），新增 Tool 不需要改核心代码
- [ ] 完整数据流跑通：模型决定调用 → 解析参数 → 执行 → 结果回传 → 模型继续
- [ ] Tool 参数用 Zod 校验，非法参数不会打到真实服务
- [ ] Tool 执行报错时，错误信息以模型能理解的方式回传（而不是抛异常终止）
- [ ] 处理过一次并行 Tool Call（模型一次返回多个调用）
- [ ] 至少一个 Tool 有权限/危险操作检查
- [ ] 至少一个有副作用的 Tool 是**幂等**的（同一参数执行两次，业务结果一样）
- [ ] 能画出 **Tool Gateway**：模型发出 tool_call ≠ 允许执行；执行前校验权限 / 配额 / 危险操作
- [ ] 能解释「用户委托授权」：Agent 调第三方 API 应用**用户**的 OAuth，不能所有用户共用一把上帝 Key（概念即可，不必接真 OAuth）

**自测问题**：Tool Calling 的完整数据流是什么？Tool Description 写得好不好对效果影响有多大？模型幻觉出一个不存在的 Tool 怎么办？为什么「模型请求了」还不能直接执行？

**常见坑**：Tool Description 写得太简略，模型不知道什么时候该调用；或者一次注册 20 个 Tool 把模型搞晕。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`function calling guide` · `writing good tool descriptions LLM`

## 本地拆步

> 落到 `apps/05-Tool-Calling/{小节文件夹}/`。LLM 配置通过 `apps/load-root-env.ts` 读 `apps/.env`，所有 demo 共用。

1. `src/registry.ts` + 3～4 个 Tool，参数用 Zod
2. 跑通 model → execute → tool_result → model
3. 一次并行调用；至少一个幂等 Tool；执行前过 Gateway 钩子（请求 ≠ 执行）
