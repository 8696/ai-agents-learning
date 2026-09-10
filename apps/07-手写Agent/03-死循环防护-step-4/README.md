# 模块 07 · 03 · 死循环防护 · step-4

## 跑入口

```bash
cd apps && yarn app:07-03-loop-guard-step-4
```

浏览器：`http://127.0.0.1:50062/`

## 端口

`50062`

## 数据流

```
浏览器 → koa
  ├─ POST /api/agent/run-with-cancel   ← 启后台 run，立刻返 { runId, status: "running" }
  │                                     controller = new AbortController(); runLoop 不 await
  ├─ GET  /api/agent/run-status/:runId ← 轮询拿结果
  ├─ POST /api/cancel/:runId            ← controller.abort() → runLoop while 看到 abortSignal.aborted → break
  └─ GET  /health                       ← { ok, port, provider, model, hasKey, callsModel: true }
```

按钮 A → 启 run → 等几秒看 trajectory 数字 → 点按钮 B「取消」→ 看 stoppedReason = `user_cancel`。

## 当前能做什么

- 跑一个慢任务（latencyMsPerStep 默认 300ms · 真模型调 3 个 SKU ≈ 8 秒）。
- 跑动开始后立刻返 runId，前端开始轮询（默认 1 秒一次）。
- 中途点「取消」→ AbortController.abort() → runLoop break → stoppedReason = `user_cancel`。
- 如果没点取消：跑动正常结束 → stoppedReason = `model_says_stop` / `timeout` / `max_steps`。
- 数字面板：已跑轮数（stepCount） / 累计 token 估算（tokenEstimate） / 实际耗时（elapsedMs） / 停下来的原因（stoppedReason · 取值 max_steps / timeout / model_says_stop / user_cancel）。

## 对应学习沉淀

[docs/学习模块/07-手写Agent/03-死循环防护.md](../../../docs/学习模块/07-手写Agent/03-死循环防护.md)