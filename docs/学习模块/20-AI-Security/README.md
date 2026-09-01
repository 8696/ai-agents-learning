[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / `apps/20-AI-Security/{小节文件夹}/README.md`

# 模块 20 · AI Security ⭐⭐⭐⭐⭐

[← 19 可靠性 / 成本 / 性能](../19-可靠性成本性能/README.md) · [21 后端 & 基础设施 →](../21-后端与基础设施/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」以 `apps/20-AI-Security/{小节文件夹}/README.md` 为准。
> **代码落点**：`apps/20-AI-Security/{小节文件夹}/`（详见 [AGENTS.md §4](../../../AGENTS.md#4-代码落点)）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。外部条勾 ✅ 前须判断本条 Demo（[AGENTS.md §5.2](../../../AGENTS.md#52-小节-demo)）。本地产出是验收收口，不是第一次灌全部代码。

| 状态 | 重点（学什么） | 本条要能讲清 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**Prompt Injection**：用户直接注入；RAG 文档里的间接注入](./01-Prompt-Injection.md) | 能各演示或讲清一种攻击路径；能区分 Jailbreak（诱使突破安全策略）和 Injection（外部内容当指令）；Tool Injection 发生在工具返回值里 | `prompt injection LLM attack` `indirect prompt injection RAG` `jailbreak vs prompt injection` · [OWASP LLM Top 10](https://genai.owasp.org/llm-top-10/) · Anthropic 安全文档 | — |
| ⬜ | [**SSRF / Sandbox**：Agent 能出网、能跑代码时的边界](./02-SSRF-Sandbox.md) | 知道「让模型决定 URL」有什么危险 | `SSRF prevention` `sandbox code execution agent` · OWASP SSRF · Docker 安全基线 | — |
| ⬜ | [**Tool Gateway / OAuth**：执行前策略层；用户身份 ≠ 上帝 Key](./03-Tool-Gateway-OAuth.md) | 能画出「谁授权、谁执行」 | `OAuth for AI agents` `MCP authorization` · MCP Auth 规范 · OWASP LLM | — |
| ⬜ | [**本地产出**](./04-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：Agent 能执行真实操作，因此安全非常重要。

**动手产出**：对自己的 Agent 做一次完整 Security Audit，输出报告。

**验收标准**
- [ ] 理解并实测过 Prompt Injection（自己攻击自己的 Agent 成功过）
- [ ] 能区分 Jailbreak（诱使突破安全策略）和 Injection（把外部内容当指令）；能说明 Tool Injection 发生在工具返回值里
- [ ] 实现了针对间接注入的防御（检索到的内容、网页内容不能当指令执行）
- [ ] Tool 有权限校验，且遵循最小权限原则
- [ ] 危险操作有 Human Approval
- [ ] **Tool Gateway**：所有 Tool 执行前过同一层策略（权限、参数校验、不可逆操作拦截）；Prompt Injection 不能绕过这层去直连执行函数
- [ ] 能说明 **OAuth 用户委托** vs **服务账号上帝 Key** 的差异，以及为什么 Agent 场景前者更安全
- [ ] 文件操作有路径校验，防目录穿越
- [ ] 网络请求有 SSRF 防护（禁止访问内网地址）
- [ ] 代码执行在 Sandbox 内
- [ ] Secrets 不会出现在发给模型的上下文里、也不会出现在日志里
- [ ] 输出了一份 Security Audit 文档

**自测问题**：Agent + Tool 的安全边界如何设计？什么是间接 Prompt Injection？Tool Gateway 拦的是模型还是执行层？如何防止 Agent 泄漏系统 Prompt 和密钥？

**常见坑**：只防「用户直接输入的恶意指令」，忽略了**从 RAG 文档、网页、工具返回值里进来的注入**——这才是 Agent 时代的主要攻击面。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`prompt injection LLM` · `indirect prompt injection RAG` · OWASP LLM Top 10

## 本地拆步

> 落到 `apps/20-AI-Security/{小节文件夹}/`。

1. 自己打自己：直接注入 + RAG/网页里的间接注入，至少成功过一次再做防御
2. 所有 Tool 执行前过 Gateway；路径校验 / SSRF / Sandbox
3. 输出一份 Security Audit 文档（[学习总览](../../06-学习总览.md)用这份）
