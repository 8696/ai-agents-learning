# 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-3 加重规划增量

> step-3 状态：**🔄 打磨中**（2026-09-10）。基于 step-2 完整复制（§5.3.14 增量构建）。**sketch**：仍不要求 §5.3.2 6 项齐。学习者主动锁定那一刻才校验。

## 端口

`50055`

## 跑入口

```bash
cd apps && yarn app:07-02-plan-vs-step-step-3
```

浏览器：[http://127.0.0.1:50055/](http://127.0.0.1:50055/)

## step-3 相对 step-2 的增量

| 维度 | step-2 | step-3 |
| ---- | ------ | ------ |
| A 路径（一步步走）| 真模型循环 | **不变**（每圈自选调啥，最多 MAX_ROUNDS=8 圈）|
| B 路径（先规划）规划器 | 真规划器一次吐 plan | **真规划器 + 重规划**：执行阶段每步后 `shouldReplan(observations)` 检测；触发就再调 `planWithLlm(task, observations)` 出 v2 plan |
| B 路径触发条件 | n/a | **默认**：所有 query_stock 库存都是 0（>= 1 次即触发）→ 重规划 |
| B 路径返回 | `plan + plannerRawText + plannerFallback` | `plans: [{version, steps, rawText, fallback, reason?}] + plannerIterations` |
| executeTrace | 每步含 `index / step / result / costMs` | 每步**新增** `planVersion: 1 \| 2`（标这一步用的是哪一版 plan）|
| 端口 | 50054 | **50055** |
| yarn script | `app:07-02-plan-vs-step-step-2` | `app:07-02-plan-vs-step-step-3` |

## 数据流

```text
浏览器点「跑左栏」或「跑右栏」或「同时对照」
  │
  ├─ GET /api/step-by-step     → routes/step-by-step.ts → runStepByStep
  └─ GET /api/plan-and-execute → routes/plan-and-execute.ts → runPlanAndExecute
  │
  ├─ runStepByStep（同 step-2，不变）
  │     └─ 真模型每圈调，tool_calls 空 → 最终答案 / MAX_ROUNDS=8 兜底
  │
  └─ runPlanAndExecute（step-3 增量核心）
        ├─ doPlan(1)：真规划器第 1 次吐 plan（v1）
        ├─ 执行阶段 while 循环（双层）
        │     ├─ 调 plan 当前步 → invokeTool（mock）
        │     ├─ 累积 observations
        │     ├─ shouldReplan(observations) 检测（lib/flow/replan.ts）
        │     │     └─ 触发 → doPlan(2, observations, reason) 出 v2 → curPlan = v2, curPlanIdx = 0
        │     │           observations 清零（新版本从 0 开始，避免无限循环）
        │     └─ 不触发 → curPlanIdx++
        │     保险：MAX_PLAN_VERSIONS=3
        └─ plans.length = plannerIterations
  │
  ▼
两侧各自返回 JSON；对照数字由浏览器用两次结果现场算
  │
  ▼
React 渲染：右栏 plans.map() 渲染 v1（已废灰卡）+ v2（当前执行绿卡）；执行卡每步显示 planVersion
```

服务端日志（`logs/YYYY-MM-DD.log`）：
- v1 规划：调用模型开始/结束 + planner-v1 五条日志
- 执行 v1 步：调用函数-invokeTool 五条 + 调用循环 第 N 步 五条
- 重规划触发：调用函数-replan-detector 触发 + 原因
- v2 规划：调用模型开始/结束（planWithLlm 带 observations）+ planner-v2 五条日志
- 执行 v2 步：每步带 `[v2]` scope

## 当前能做什么

- 固定任务：「春季上新：拉库存、给有货 SKU 写文案、通知运营」
- 任务在 step-3 实际能触发重规划：模型调 query_stock 后发现 SKU 都是 0 → shouldReplan 返回 true → 再调 planWithLlm 出 v2
- 点「跑左栏 / 跑右栏 / 同时对照」→ 两侧各发各的请求（同时对照 = 浏览器并发两次，不是服务端打包）
- 点「跑对照」 → 双栏 + 4 个对照卡
  - 顶部对照卡新增「重规划触发」+「计划版本数」（变体 C 可观察锚点）
  - 右栏计划卡：v1（已废折叠灰卡「step-3 重规划后」）/ v2（当前执行绿卡「新计划」） + 「触发原因」标注
  - 右栏执行卡：每步带 `v1` / `v2` 标签 + 「v2 第 N 步」副标
- 顶部栏头：「规划 N 次（v1 → v2 重规划）」标注

## step-3 教学点

- **本条 step-3 增量**：重规划
- **对照 step-2 的变化**：
  - 计划不再只一份 —— 是 plans 数组，每次重规划追加一版
  - executeTrace 每步带 planVersion（标这一步用的是哪一版 plan）
  - 重规划检测默认「所有 SKU 0 库存」—— 演示观察推翻原计划时怎么换 plan
  - UI 上能直接画「计划 v1（已废灰卡）→ 计划 v2（绿卡）」对比
- **不在 step-3**（后续 step 再加）：
  - 变体 D（短任务不值得规划）：让两个 task 对照「规划是浪费」
  - 变体 F（计划给人看）：加确认按钮
  - 变体 G（真实计时）：用 sleep 模拟延迟，记录真实 ms

## 对应学习沉淀

[docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md](../../../docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md)

## 下一步

- 学习者主动锁定 step-3 → 双方决定 step-4 加什么（按 §5.3.14）：
  - 变体 D 短任务对照：让两个 task（短 vs 长）跑出来对比「规划是浪费」
  - 变体 F 计划给人看：右栏加「待确认 / 已确认」状态 + 确认按钮
  - 变体 E 计划过期仍执行：跟变体 C 对照 —— 不重规划就按旧清单继续（错）
  - 锁前 §5.3.2 6 项里缺的按需补
