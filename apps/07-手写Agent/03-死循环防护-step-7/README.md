# 模块 07 · 03 · 死循环防护 · step-7

## 跑入口

```bash
cd apps && yarn app:07-03-loop-guard-step-7
```

浏览器：`http://127.0.0.1:50065/`

## 端口

`50065`

## 数据流

```
浏览器 → koa
  ├─ POST /api/agent/token-budget  ← mock 模型每轮调不同 sku（避开闸门 6 干扰）
  │                                 闸门 7（变体 7）看累计 tokenEstimate > tokenBudget → stoppedReason=token_budget
  └─ GET  /health                  ← { ok, port, provider, model, hasKey, callsModel: false }
```

按钮：跑「token 预算」→ 闸门 7 在 tokenEstimate 超 tokenBudget 时触发。

## 当前能做什么

- 跑 token 预算闸：mock 模型每轮调不同 sku，tokenEstimate 每轮累 160 左右（mock 估算：120 system+user + ~40 tool result）。
- 改 tokenBudget：调小（50/100）让闸门更快触发；调大（5000）让 max 闸先到。
- 改 maxSteps：观察闸门叠加——max=3 时即使预算还有也会先到。
- 数字面板：已跑轮数（stepCount） / 累计 token 估算（tokenEstimate） / token 预算（tokenBudget） / 实际耗时（elapsedMs） / 停下来的原因（stoppedReason）。

## 对应学习沉淀

[docs/学习模块/07-手写Agent/03-死循环防护.md](../../../docs/学习模块/07-手写Agent/03-死循环防护.md)