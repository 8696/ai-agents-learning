[目录](../../00-目录.md) · [学习模块](../README.md) · [学习总览](../../06-学习总览.md) · 代码地图见本模块「本地产出」MD / 项目 LEARNING.md

# 模块 21 · 后端 & 基础设施 ⭐⭐⭐⭐

[← 20 AI Security](../20-AI-Security/README.md) · [22 AI 全栈产品化 →](../22-AI全栈产品化/README.md)

> **小节进度、验收、本地拆步**在本 README；**每条学习沉淀**在同目录单独 MD（「重点」列已链接）。有代码时，「现在怎么跑」仍以项目 `LEARNING.md` 为准（行号会变）。
> **项目当前地图**：`apps/04-research-agent/LEARNING.md`（回填）

## 小节进度

> 先外部（从上到下）→ 最后一行本地产出。看过的材料填「我的链接」，空着写 `—`。官方文档 → [资源清单](../../05-资源清单.md)。

| 状态 | 重点（学什么） | 够用就算过 | 搜什么 / 去哪学 | 我的链接 |
|------|----------------|------------|-----------------|----------|
| ⬜ | [**SSE 被网关缓冲**：Nginx / PaaS 默认可能攒满再发，流式会「卡住再一次性喷出」](./01-SSE-被网关缓冲.md) | 知道生产流式要关 buffer | `nginx SSE buffering disable` `reverse proxy streaming response` · Nginx `X-Accel-Buffering` · 各 PaaS 流式说明 | — |
| ⬜ | [**任务队列**：长 Agent 不要占着 HTTP 请求不放](./02-任务队列.md) | 能说出为何要异步化、用什么扛 | `BullMQ tutorial` `async agent job queue` · BullMQ 文档 · Redis 队列模式 | — |
| ⬜ | [**对象存储 / RBAC**：上传文件不进数据库大字段；角色决定能调哪些 Tool](./03-对象存储-RBAC.md) | 能说出文件落哪、为什么；能讲「角色 → 可调 Tool」，不必上完整权限系统 | `object storage vs database files` `RBAC agent tools` · S3 / 各云对象存储入门 | — |
| ⬜ | [**本地产出**](./04-本地产出.md) | 本页验收 + 学习沉淀 | — | [沉淀](./04-本地产出.md) |

## 验收

> 本地节奏 / `coach next` 勾本地前对照本节。

**一句话目标**：补齐 AI Backend 能力，把 Agent 部署成真正可访问的服务。

**动手产出**：一个部署在线上、别人能访问的 Agent 服务。

**验收标准**
- [ ] REST + SSE 接口设计合理
- [ ] PostgreSQL 存业务数据（含 pgvector 或独立向量库）
- [ ] Redis 做缓存和限流
- [ ] 有任务队列处理长耗时 Agent 任务
- [ ] 有用户鉴权，且不同用户数据隔离
- [ ] 能讲清 RBAC：角色决定能调哪些 Tool，不必上完整权限系统
- [ ] 上传文件落对象存储（或本地目录等价物），能说清为什么不把大文件塞进 Postgres
- [ ] Docker 化，一条命令能起完整环境
- [ ] 实际部署上线（Vercel / Railway / Fly.io + Supabase / Neon 均可）

**自测问题**：Agent 服务的架构怎么设计？长任务怎么处理？如何做多租户数据隔离？

**常见坑**：本地跑得好好的，一上线就发现流式响应被网关缓冲了、超时被中断了。**部署环节必须真做一次**。

**出门线索**（完整勾选表见 [小节进度](#小节进度)）：`nginx SSE buffering` · `BullMQ async jobs`

## 本地拆步

> 回填 `apps/04-research-agent`。必须真部署一次。

1. REST + SSE 对外；关掉网关/PaaS 对 SSE 的 buffer
2. 长任务进队列；用户数据隔离；文件走对象存储（或本地目录等价），不要塞进 Postgres 大字段
3. Docker 一条命令能起；实际部署到 Vercel / Railway / Fly.io 之一
