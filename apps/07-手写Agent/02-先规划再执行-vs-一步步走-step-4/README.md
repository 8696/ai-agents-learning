# 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-4 短任务对照

> step-4 状态：**🔄 打磨中**（2026-09-10）。基于锁定的 step-3 完整复制（§5.3.14 增量构建）。**sketch**：仍不要求 §5.3.2 6 项齐。学习者主动锁定那一刻才校验。

## 端口

`50056`

## 跑入口

```bash
cd apps && yarn app:07-02-plan-vs-step-step-4
```

浏览器：[http://127.0.0.1:50056/](http://127.0.0.1:50056/)

## step-4 相对 step-3 的增量

| 维度 | step-3 | step-4 |
| ---- | ------ | ------ |
| 任务 | 1 个（长任务）| **2 个**：短任务「把 todo-001 标完成」（1 步）+ 长任务「春季上新」（多步）|
| 工具 | 三个工具（query_stock / write_copy / notify_ops）| **四个工具**：加 `complete_todo(todo_id)` |
| A 路径 | 真模型循环（只用 query_stock/write_copy/notify_ops）| **真模型循环（工具通用化）**：model 自选 4 个工具之一；短任务 1 圈调 complete_todo 停 |
| B 路径 | 真规划器 + 重规划（针对长任务）| 短任务 B：规划 1 步 + 执行 1 步 / 长任务 B：保留 step-3 重规划逻辑 |
| 接口 | `GET /api/compare → { task, stepByStep, planAndExecute, comparison }` | `GET /api/step-by-step?task=short\|long` + `GET /api/plan-and-execute?task=short\|long`（四组各自请求） |
| 顶部对照 | 4 个对照卡（单任务对照）| **短 vs 长 × A vs B 数字对照 + 值得判断卡** |
| 输出 | 2 栏（双路径对照）| **2x2 网格（4 栏对照）**：短 A / 短 B / 长 A / 长 B |
| 端口 | 50055 | **50056** |

## 数据流

```text
浏览器点「跑短对照」/「跑长对照」/「四组一起」
  │
  ├─ GET /api/step-by-step?task=short     → runStepByStep("把 todo-001 标完成")
  ├─ GET /api/plan-and-execute?task=short → runPlanAndExecute("把 todo-001 标完成")
  ├─ GET /api/step-by-step?task=long      → runStepByStep("春季上新...")
  └─ GET /api/plan-and-execute?task=long  → runPlanAndExecute("春季上新...")
  │
  ▼
四组各自返回 JSON；对照数字由浏览器用对应那一次请求的结果现场算
  │
  ▼
React 渲染：2x2 网格 + 短 vs 长「值不值得规划」判断
```

## 当前能做什么

- 两个任务自动跑：
  - 短任务「把 todo-001 标完成」= 1 步（complete_todo）
  - 长任务「春季上新...」= 多步（query_stock / write_copy / notify_ops）
- 点「跑短对照 / 跑长对照 / 四组一起」→ 每组自己的请求（四组一起 = 浏览器并发四次，不是服务端打包）
- 顶部对照卡：短 / 长 × A / B 数字（模型调用次数 / 步数 / 总耗时 ms）+ 值得判断
- 4 栏对照（2x2）：
  - 短 A：trajectory 1 圈（complete_todo + 最终答案）
  - 短 B：plan 1 步 + execute 1 步 + 最终答案
  - 长 A：trajectory N 圈（每圈自选调啥）
  - 长 B：plan v1+v2 + executeTrace + 最终答案
- 「值得 vs 不值得」判断：
  - 短任务：B 多付 1 次规划 → ❌ NO（不值得）
  - 长任务：B 调规划次数 < A 调模型次数 → ✅ YES（值得）

## step-4 教学点

- **本条 step-4 增量**：变体 D「短任务不值得先规划」
- **对照 step-3 的变化**：
  - 4 组轨迹并行跑（之前是 2 组）
  - 新增 complete_todo 工具（短任务用）
  - SYSTEM_PROMPT_REACT 通用化（4 个工具都列，让模型自选）
  - 顶部对照卡新增「值得 vs 不值得」判断
  - 输出区 2x2 网格（之前是 2 栏）
- **不在 step-4**（后续 step 再加）：
  - 变体 E 计划过期仍执行（跟变体 C 对照）
  - 变体 F 计划给人看（加确认按钮）
  - 变体 G 真实计时（用 sleep 模拟延迟）

## 对应学习沉淀

[docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md](../../../docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md)

## 下一步

- 学习者主动锁定 step-4 → 双方决定 step-5 加什么（按 §5.3.14）：
  - 变体 E 过期仍执行：让 mock 工具返回「世界变了」+ UI 标黄（跟变体 C 对照）
  - 变体 F 计划给人看：右栏加确认按钮 + 状态机
  - 锁前 §5.3.2 6 项里缺的按需补
