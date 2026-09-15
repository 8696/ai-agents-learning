# 写入策略 · 第九步（写入时机 · 第 1 关完整版）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-9
```

浏览器打开：http://127.0.0.1:50112/

端口：`50112`（yarn 脚本 inline `PORT=50112`；`lib/http/runtime-ctx.ts` `.default(50112)` 兜底）

## 数据流

```text
用户访问 http://127.0.0.1:50112/
  → #page-intro + #core-takeaway 讲清本页演示什么 + 五条核心教学点
  → #controls 输入 user text + conversationId + 三个按钮
  → #output 三栏对照卡 + 时间窗口观察卡 + 结算结果卡

用户点「热路径（eager · 同步）」:
  → POST /api/trigger { mode: "eager", text, conversationId }
  → 调 lib/flow/trigger-write.ts:triggerWrite(eager)
  → ① extractFacts(text) 调模型抽 0~N 条候选（同步）
  → ② 对每条 candidate 直接 kvSet 写库
  → ③ 返 { mode, factsCountBefore, factsCountAfter, durationMs, candidatesCount, writtenKeys }
  → 用户立刻看到「耗时 + 库条数 +N」

用户点「后台异步（background · 异步）」:
  → POST /api/trigger { mode: "background", text, conversationId } 返 202 + runId
  → triggerWrite 把 run 状态写入内存 Map，立刻返 trigger 响应
  → 后台 setImmediate + sleep 2 秒后跑 extractFacts + kvSet
  → 页面右上 BackgroundStatusCard 每 0.5s 轮询 GET /api/trigger/status/:runId 看 run 状态
  → 用户可用「紧接查 recall / 3s 后再查 recall」对照时间窗口——紧接查时库里还没新事实，3s 后再查就有了

用户点「会话结束才写（session-end · 延迟）」:
  → POST /api/trigger { mode: "session-end", text, conversationId }
  → triggerWrite 把 { text, queuedAt } 推到 pendingConversations[conversationId]，立刻返
  → 库条数不变（事实没写）
  → 顶部 status bar 每 2s 轮询 GET /api/status 看「待结算会话」列表

用户点「结束会话（close session）」:
  → POST /api/conversation/:id/close
  → flushConversation 把该会话待结算队列一次性 extract + kvSet 写库
  → 返 { flushedItems, factsCountBefore, factsCountAfter, writtenKeys, durationMs }
  → 页面下方 FlushResultCard 显示结算结果 + 库条数变化

所有 sub-mode 共享 lib/db.ts（继承 step-7 的 kv 表）+ extract-facts.ts（调真模型抽）
+ lib/flow/trigger-write.ts（本步核心：三种 mode 汇合处）。
```

## 当前能做什么

| 子节 / 按钮 | 入口 | 演示什么 | 覆盖变体 |
| --- | --- | --- | --- |
| 热路径（eager · 同步） | `POST /api/trigger { mode: "eager" }` | 同一段对话原文 → 立刻同步跑完整流程（extractFacts + kvSet）→ 库条数立刻 +N | 变体 1-A 每轮实时写 |
| 后台异步（background · 异步） | `POST /api/trigger { mode: "background" }` 返 202 + runId | 触发响应快（不入真库），后台 sleep 2s 后异步写库；紧接 recall 召回不到，过一会儿就有了 | 变体 1-B 后台异步 + 时间窗口不一致 |
| 会话结束才写（session-end · 延迟） | `POST /api/trigger { mode: "session-end" }` | text 入待结算队列，库条数不变；调 POST /api/conversation/:id/close 才一次性结算 | 变体 1-C 会话结束 |
| 紧接查 recall / 3s 后再查 recall | `GET /api/recall` | 验证后台异步触发后的时间窗口——紧接查时 count 不变，3s 后再查 +N | 变体 1-B 不一致窗口 |
| 顶部 status bar（轮询） | `GET /api/status`（每 2s） | 实时看库条数 + 后台队列 + 待结算会话 | — |
| 库清单（GET /api/facts） | `GET /api/facts` | 列事实库（与 step-7/8 一致，便于对照） | — |

## 当前未做

- **变体 1-D 离线批量跑**：每天凌晨集中处理——属于后端与基础设施模块（模块 21），本仓库不演示。
- **变体 1-E 用户显式命令 / 模型自己调工具**：把写入做成 `save_memory` 工具交给模型自己决定——属于 Agent 工具调用层，留给 step-N+。
- **把关 / 去重 / 冲突**：本步不演示这三件事，直接对每条候选 `kvSet` 整覆盖——变体 2~5 已分别在 step-1~8 锁定。
- **持久化**：后台 run 状态 + session-end 待结算队列都存内存 Map，重启清空（与 step-6 待确认区同思路）；生产可换 Redis / SQLite。
- **需求 6 · 过期 / 需求 7 · 压缩 / 需求 8 · 审计**：留给 step-(10/11/12+)。
