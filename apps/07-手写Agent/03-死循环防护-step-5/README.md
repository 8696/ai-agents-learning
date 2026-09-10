# 模块 07 · 03 · 死循环防护 · step-5

## 跑入口

```bash
cd apps && yarn app:07-03-loop-guard-step-5
```

浏览器：`http://127.0.0.1:50063/`

## 端口

`50063`

## 数据流

```
浏览器 → koa
  ├─ POST /api/agent/with-retry    ← 偶发失败：mock 工具按 flakyRate 概率失败
  │                                   闸门 5（变体 5）最多重试 toolMaxRetries 次
  │                                   重试成功 → 继续 while；都失败 → 降级（tool_unavailable）
  ├─ POST /api/agent/always-fail  ← 100% 失败：重试 toolMaxRetries 次后 stoppedReason=tool_retry_cap
  └─ GET  /health                  ← { ok, port, provider, model, hasKey, callsModel: true }
```

按钮 A → 看「重试成功」路径；按钮 B → 看「降级」路径。

## 当前能做什么

- 跑「偶发失败」：默认 flakyRate=0.5，3 次重试 — 通常第 2/3 次成功，trajectory 显示「重试 1/3 失败 → 重试 2/3 成功」。
- 跑「100% 失败」：默认 3 次重试全失败 — 闸门 5 触发，stoppedReason=`tool_retry_cap` + summary.toolUnavailable=true + 闸门提示「工具 queryStock 重试 3 次全失败 · 降级」。
- 数字面板：已跑轮数（stepCount） / 工具调用次数（toolCallCount） / 工具失败次数（toolFailureCount） / 重试成功次数（toolRetrySuccessCount） / 实际耗时（elapsedMs） / 停下来的原因（stoppedReason · 取值 max_steps / timeout / model_says_stop / user_cancel / tool_retry_cap）。

## 对应学习沉淀

[docs/学习模块/07-手写Agent/03-死循环防护.md](../../../docs/学习模块/07-手写Agent/03-死循环防护.md)