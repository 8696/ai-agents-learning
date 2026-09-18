# 模块 11 · 03 人机回圈（Human-in-the-loop）· step-1：转账在点头前停住

## 怎么跑

```bash
cd apps && yarn app:11-03-human-in-the-loop-step-1
```

- 端口：`50127`
- 浏览器：<http://127.0.0.1:50127/>
- 需要密钥：否。本地计算，不调大模型。

页面：

- `/` 一次转账：先提议（余额不变）再通过（这时才扣款）

## 数据流

```text
GET  /api/snapshot
  → lib/flow/pause-before-side-effect.ts:getSnapshot
  → 假账本 + 待审批原文

POST /api/propose { to, amount }
  → mustPause("transfer") = true
  → 写入 pending.status=waiting
  → 不调用 executeTransfer
  → 余额不变，transferCallCount 仍是 0

POST /api/approve { runId }
  → 核对 pending.runId
  → 这时才 executeTransfer
  → 余额减少，transferCallCount 变成 1
```

## 当前能做什么

- 看见点头前副作用为零：提议之后余额仍是 10000，扣款函数调用次数仍是 0。
- 看见摊开的待审批：收款人、金额、任务运行编号（runId）。
- 点「通过」之后才扣一次。
- 空入参走 400；「演示后端 5xx」走 500。
- 本步没有拒绝、改参数、杀进程再批、超时。内存表，重启会丢单。

## 对应学习写入小节文档

[docs/学习模块/11-Agent-State-Workflow/03-Human-in-the-loop.md](../../../docs/学习模块/11-Agent-State-Workflow/03-Human-in-the-loop.md)
