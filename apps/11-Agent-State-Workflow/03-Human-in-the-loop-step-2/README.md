# 模块 11 · 03 人机回圈（Human-in-the-loop）· step-2：杀进程再批（单还在、钱没动）

## 怎么跑

```bash
cd apps && yarn app:11-03-human-in-the-loop-step-2
```

- 端口：`50128`
- 浏览器：<http://127.0.0.1:50128/>
- 需要密钥：否。本地计算，不调大模型。

页面：

- `/` 总览（指向三个 sub-page + 指 step-1 看通过 / 拒绝 / 只读对照）
- `/pages/restart-recovery.html` 杀进程再批（变体 E · 单还在、钱没动）
- `/pages/timeout-default.html` 超时默认拒绝（变体 G · 30 秒演示）
- `/pages/channel-failure.html` 渠道失败 ≠ 人拒绝（变体 F）

## 数据流

```text
启动：
  server.ts:await initState()
    → lib/flow/transfer-state.ts:initState()
    → lib/db.ts:kvGet("default", "ledger_state") / kvGet("default", "pending")
    → 如果有 pending（status=waiting），恢复 currentNode="waitForHuman"

GET  /api/snapshot
  → 查 isPendingExpired(pending) ? 自动调 rejectTransfer（变体 G · 超时检测在这里）
  → lib/flow/pause-before-side-effect.ts:getSnapshot
  → ctx.body = { ok, snapshot, secondsLeft, timeoutMs, isExpired }
  → 前端 timeout-default.html 每秒 setInterval 调一次

POST /api/propose { to, amount }
  → mustPause("transfer") = true
  → 写入 pending.status=waiting（内存 + lib/db.ts:kvSet("default", "pending", …)）
  → 写入 waitingStartedAt = now()
  → 不调用 executeTransfer
  → 余额不变，transferCallCount 仍是 0

POST /api/approve { runId, forceFail?: boolean }
  → 查 isPendingExpired(pending)（变体 G · 入口先查，已超时就 400）
  → 核对 pending.runId
  → try lib/flow/transfer-tools.ts:executeTransfer(ledger, pending.args, forceFail)
     成功 → setLedger + pending.status="executed"、currentNode="executed"
     失败（变体 F · forceFail 或余额不足）→ pending.status="failed"、currentNode="executed_failed"，账本未改
  → lib/db.ts:kvSet("default", "ledger_state", …) (成功时)
  → lib/db.ts:kvDel("default", "pending")（不论 executed / failed，pending 终结）

POST /api/reject / /api/edit / /api/read / /api/reset 同款：内存 + 写盘。
所有「setPending / setLedger / incrementBalanceReadCount / resetState」都触发 fire-and-forget 的 SQLite 写。

杀进程 + 重启：
  Ctrl+C 杀服务 → 内存状态丢 → yarn app:... 重启 → initState() 从 SQLite 读回 ledger / pending
  → pending.status 仍 waiting + waitingStartedAt 保留 → currentNode="waitForHuman"
  → 倒计时从原 waitingStartedAt 继续算（不是从进程起算）

变体 G · 超时收场：
  PENDING_TIMEOUT_MS = 30000（lib/flow/transfer-state.ts · 本 demo 用 30 秒方便演示）
  → snapshot 路由每次 GET 都查 isPendingExpired → 过期就自动 rejectTransfer
  → approve 入口先查过期：已超时返 400「已超时按默认拒绝收场」
  → 前端 setInterval 拉 snapshot 看 secondsLeft：0 → 显示「已超时按默认拒绝收场」

变体 F · 渠道失败 ≠ 人拒绝：
  approve body 带 forceFail=true → executeTransfer throw「支付渠道失败：模拟银行接口返回 500」
  → approveTransfer catch 后写 pending.status="failed"、currentNode="executed_failed"
  → 账本未改、transferCallCount 仍是 0（executeTransfer throw 前未改账本）
  → PendingPanel 橙红色边框 + 文案「人已通过，但执行失败」
  → channel-failure sub-page 提供「通过（模拟渠道失败）」按钮
```

## 当前能做什么

- 杀掉服务再起来，pending 仍在、runId 不变、余额不变、transferCallCount 仍是 0。
- 30 秒内点通过 → executeTransfer 跑一次；不点 → snapshot 检测过期 → 自动转 rejected。
- 超时后再点通过 → 400「已超时按默认拒绝收场」（变体 G 的关键不变量）。
- 通过（模拟渠道失败）→ pending.status=failed、currentNode=executed_failed、账本未改（变体 F 的关键不变量）。
- 提议 / 拒绝 / 改参数 / 查余额 / 重置 都覆盖。
- 通过 / 拒绝 / 改参数 / 只读对照 在 step-1（端口 50127）看——step-2 不重复这些 sub-page。
- 本步八条需求全部实现（删数据未做；只读 / 通过 / 拒绝 / 改参数 / 写死策略 在 step-1）。

## 对应学习写入小节文档

[docs/学习模块/11-Agent-State-Workflow/03-Human-in-the-loop.md](../../../docs/学习模块/11-Agent-State-Workflow/03-Human-in-the-loop.md)
