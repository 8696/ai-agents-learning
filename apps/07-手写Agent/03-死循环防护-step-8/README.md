# 模块 07 · 03 · 死循环防护 · step-8

## 跑入口

```bash
cd apps && yarn app:07-03-loop-guard-step-8
```

浏览器：`http://127.0.0.1:50066/`

## 端口

`50066`

## 数据流

```
浏览器 → koa
  ├─ POST /api/agent/todo-assistant  ← 业务选型面板：7 个 checkbox 控制每闸装/不装
  │                                   真调模型跑 todo 业务；7 闸叠加
  │                                   一键预设：「最少必备 4 道」vs「生产标准 7 道」
  └─ GET  /health                    ← { ok, port, provider, model, hasKey, callsModel: true }
```

按钮：跑 todo 助手 + 一键「4 道」/「7 道」预设。

## 当前能做什么

- 跑 todo 助手端到端：7 闸可独立勾选；同一端点不同配置对比「按业务选装」的取舍。
- 一键预设：
  - **「最少必备 4 道」** = 变体 1/2/3/4 装，5/6/7 不装（典型「只防住最常见三种」配置）
  - **「生产标准 7 道」** = 变体 1~7 全装
- 改参数：maxSteps / timeoutMs / tokenBudget / toolMaxRetries / loopDetectionWindow / query
- 数字面板：已装闸数量 / 实际触发哪道闸 / 已跑轮数 / 累计 token / 实际耗时 / 模型总结（finalAnswer）

## 对应学习沉淀

[docs/学习模块/07-手写Agent/03-死循环防护.md](../../../docs/学习模块/07-手写Agent/03-死循环防护.md)