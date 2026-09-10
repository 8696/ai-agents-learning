# 模块 07 · 03 · 死循环防护 · step-1

## 跑入口

```bash
cd apps && yarn app:07-03-loop-guard-step-1
```

浏览器：`http://127.0.0.1:50059/`

## 端口

`50059`

## 数据流

```
浏览器 → koa → routes/agent.ts → lib/flow/loop.ts（runLoop）
                          │
                          ├─ 反例：enableMaxStepsGate=false → 硬跑到 200 步人为截停
                          └─ 闸门：enableMaxStepsGate=true  → MAX_STEPS=10 触发 break
```

返回前端：trajectory（每步快照）+ stepCount + tokenEstimate + stoppedReason + gateTriggered。

## 当前能做什么

- 跑反例：故意不装闸，看数字面板里 stepCount / tokenEstimate 涨到 200 / token 爆炸。
- 跑闸门版：装上 max iterations 闸（默认 10 步），看 stepCount 涨到 10 就 break，token 估算远低于反例。
- 数字面板并排对照：一眼看出「有闸 vs 没闸」在 token 上的差距。

## 对应学习沉淀

[docs/学习模块/07-手写Agent/03-死循环防护.md](../../../docs/学习模块/07-手写Agent/03-死循环防护.md)