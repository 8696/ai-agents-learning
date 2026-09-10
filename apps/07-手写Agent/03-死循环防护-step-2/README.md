# 模块 07 · 03 · 死循环防护 · step-2

## 跑入口

```bash
cd apps && yarn app:07-03-loop-guard-step-2
```

浏览器：`http://127.0.0.1:50060/`

## 端口

`50060`

## 数据流

```
浏览器 → koa → routes/agent.ts → lib/flow/loop.ts（runLoop）
                          │
                          ├─ ① max iterations 单闸（POST /api/agent/with-gate）—— 仅 max 闸生效
                          ├─ ② timeout 单闸（POST /api/agent/timeout-gate）—— 仅 timeout 闸生效
                          └─ ③ 双闸叠加（POST /api/agent/dual-gate）—— 两闸同时生效，看谁先到
```

返回前端：trajectory（每步快照 + wallClockMs）+ stepCount + tokenEstimate + stoppedReason + gateTriggered + elapsedMs。

## 当前能做什么

- 跑 max iterations 单闸（默认 5 步）：看到 stopReason=`max_steps` + elapsedMs 接近 0（latency=0）。
- 跑 timeout 单闸（默认 300ms / 80ms 每轮）：看到 stopReason=`timeout` + elapsedMs≈300 + stepCount≈3~4。
- 跑双闸叠加：max=10 + timeout=300ms + latency=80ms → 因为 10 轮 × 80ms = 800ms > 300ms，**timeout 先到**；stopReason=`timeout` + elapsedMs≈300 + stepCount≈3~4。
- 改 latency / maxSteps / timeoutMs 三个输入框，三个按钮各自重新跑，数字面板并排对照。

## 对应学习沉淀

[docs/学习模块/07-手写Agent/03-死循环防护.md](../../../docs/学习模块/07-手写Agent/03-死循环防护.md)