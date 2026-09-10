# 模块 07 · 03 · 死循环防护 · step-6

## 跑入口

```bash
cd apps && yarn app:07-03-loop-guard-step-6
```

浏览器：`http://127.0.0.1:50064/`

## 端口

`50064`

## 数据流

```
浏览器 → koa
  ├─ POST /api/agent/loop-detection  ← mock 模型永远调 queryStock("SKU-LOOP")
  │                                   闸门 6（变体 6）看最近 N-1 步工具调用是否同工具同参数
  │                                   是则 stoppedReason=tool_call_loop + loopDetected=true
  └─ GET  /health                    ← { ok, port, provider, model, hasKey, callsModel: false }
```

按钮：跑「同工具循环检测」→ 闸门 6 在第 N 步触发。

## 当前能做什么

- 跑同工具循环检测：mock 模型每轮都问 SKU-LOOP 的库存；连续 3 次（loopDetectionWindow=3）同工具同参数 → 闸门 6 触发。
- 改 loopDetectionWindow：调大（5 / 10）让闸门更宽松，调小（2）让它更敏感。
- 改 maxSteps：超过 loopDetectionWindow + 1 时，max 闸先到，loop detection 不会触发（看闸门叠加）。
- 数字面板：已跑轮数（stepCount） / 实际耗时（elapsedMs） / 停下来的原因（stoppedReason） / 循环标记（loopDetected） / 最近 N 步工具调用（recentToolCalls）。

## 对应学习沉淀

[docs/学习模块/07-手写Agent/03-死循环防护.md](../../../docs/学习模块/07-手写Agent/03-死循环防护.md)