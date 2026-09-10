# 模块 07 · 03 · 死循环防护 · step-3

## 跑入口

```bash
cd apps && yarn app:07-03-loop-guard-step-3
```

浏览器：`http://127.0.0.1:50061/`

## 端口

`50061`

## 数据流

```
浏览器 → koa → routes/agent.ts → lib/flow/loop.ts（runLoop）
                          │
                          ├─ ① max iterations 单闸（mock · POST /api/agent/with-gate）
                          ├─ ② timeout 单闸（mock · POST /api/agent/timeout-gate）
                          ├─ ③ model_says_stop 单闸（真模型 · POST /api/agent/model-stop-gate）
                          └─ ④ 三闸叠加（真模型 · POST /api/agent/triple-gate）
```

按钮 ③ ④ 真调模型（看真 `finish_reason`）；①② 仍走 mock。

## 当前能做什么

- 跑 ① max iterations 单闸：5 步停（mock）。
- 跑 ② timeout 单闸：4 步 / ~326ms 停（mock + sleep）。
- 跑 ③ model_says_stop 单闸：真模型按 query 调工具 → 自己输出 final_answer → break；trajectory 显示 `finish_reason=stop`。
- 跑 ④ 三闸叠加：max + timeout + model_stop 三闸同在，看实际谁先到谁 break。
- 改 query：默认「查 SKU-001 / SKU-002 / SKU-003 的库存，完成后输出 final_answer」。
- 改 maxSteps / timeoutMs / latency/轮：三个按钮各自重新跑。

## 对应学习沉淀

[docs/学习模块/07-手写Agent/03-死循环防护.md](../../../docs/学习模块/07-手写Agent/03-死循环防护.md)