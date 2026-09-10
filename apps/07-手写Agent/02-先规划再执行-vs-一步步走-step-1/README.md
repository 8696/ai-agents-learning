# 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-1 最小可观察

> step-1 状态：**🔄 打磨中**（2026-09-10）。**sketch**：不调真 LLM（mock 模型 + mock 工具；§5.3.0 例外「纯协议形状 / UI 渲染层演示」），不要求 §5.3.2 6 项齐。学习者主动锁定那一刻才校验 §5.3.2 + check-demo。

## 端口

`50053`

## 跑入口

```bash
cd apps && yarn app:07-02-plan-vs-step-step-1
```

浏览器：[http://127.0.0.1:50053/](http://127.0.0.1:50053/)

## 数据流

```text
浏览器点「跑对照」
  │
  ▼
GET /api/compare
  │
  ▼
routes/compare.ts → 并行跑 runStepByStep + runPlanAndExecute
  │
  ├─ runStepByStep（变体 A · ReAct · mock 模型固定 7 圈）
  │     ├─ 第 1 圈 Reason → query_stock(SKU-88) → 12
  │     ├─ 第 2 圈 Reason → query_stock(SKU-89) → 7
  │     ├─ 第 3 圈 Reason → query_stock(SKU-90) → 0
  │     ├─ 第 4 圈 Reason → write_copy(SKU-88)
  │     ├─ 第 5 圈 Reason → write_copy(SKU-89)
  │     ├─ 第 6 圈 Reason → notify_ops
  │     └─ 第 7 圈 Reason → tool_calls 空 → 最终答案
  │
  └─ runPlanAndExecute（变体 B · Plan-and-Execute · mock 规划器固定 6 步）
        ├─ planner 一次吐 6 步清单（plan object 在「第一次 Act 之前」已存在）
        └─ execute 顺序按清单调 6 次工具 → 拼最终答案
  │
  ▼
返回 { task, stepByStep, planAndExecute, comparison }
  │
  ▼
React 渲染：顶部 3 个对照卡 + 左栏 7 圈轨迹 + 右栏 1 张计划卡 + 6 张执行卡 + 双栏最终答案绿卡
```

服务端日志（`logs/YYYY-MM-DD.log`）每圈 / 每步写：调用循环开始/结束 + 调用函数开始/结束（入参完整 + 返回值完整 + `__code` + 耗时）。

## 当前能做什么

- 固定任务：「春季上新：拉库存、给有货 SKU 写文案、通知运营」（mock 库存 SKU-88=12 / SKU-89=7 / SKU-90=0）
- 点「跑对照」→ 双栏同时渲染
  - 左栏一步步走 7 圈：每圈「想法 + tool_call + tool_result + 耗时」白卡；最后一圈 `tool_calls 为空 → 最终答案`
  - 右栏先规划：蓝绿色「计划 v1」卡（**位置就在执行卡之前**，就是「第一次 Act 之前」）→ 6 张执行白卡 → 最终答案绿卡
- 顶部 3 个对照数字卡：
  - 模型调用次数：A=7（每圈 Reason）/ B=1（只规划器）
  - 第一次 Act 前等待：A=0 步 / B=1 步
  - 计划作为对象在第一次 Act 前：A=不存在 / B=存在
- step-1 不调真 LLM：缺 Key 也能跑（本地 mock），主按钮不因 `hasKey=false` 而 disabled
- 学习者要求「页面上表现、逻辑、流程写得更清楚一点」—— 通过双栏 + 关键差异卡 + `#core-takeaway` 实现

## step-1 教学点

- **本条「先规划再执行 vs 一步步走」最小可观察**：
  - 双栏对照：同一任务、同一套 mock 工具，两种节奏的两条轨迹并排
  - 关键差异 1：模型调用次数（A=N 圈 vs B=1 次规划 + 0 次执行）
  - 关键差异 2：第一次 Act 前的等待（A=0 步 vs B=1 步规划）
  - 关键差异 3：**计划作为对象**在第一次 Act 前是否存在（A=无 / B=有）
  - 物理骨架没变：仍是 `model → tool_call → execute → tool_result → model`；变的是 Reason 的粒度
- **不在 step-1**（后续 step 再加）：
  - 真规划器（step-2 加真模型当 Planner）
  - 重规划（变体 C）：观察推翻清单时改整份剩余清单
  - 短任务不值得规划（变体 D）：让 step-2 / 3 加对照
  - 计划过期仍执行（变体 E）：让执行时强制世界已变
  - 计划给人看（变体 F）：右上角加「待执行」状态 + 确认按钮
  - 代价对照（变体 G）：用真实计时（不只是 mock ms）让两次 Act 之间的等待时间肉眼可见

## 对应学习沉淀

[docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md](../../../docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md)

## 下一步

- 学习者主动锁定 step-1 → 双方决定 step-2 加什么（按 §5.3.14）：
  - 真规划器：把 mock planner 换成真模型调用（LLM 协议 A）；规划前/后打印 plan 对象
  - 真 Reason：把 mock MOCK_TURNS 换成真模型调用 A 路径
  - step-2 默认建议：**先加真规划器**（最贴近「先规划」的核心 —— 模型真吐清单才看得见真价值；一步步走真跑 N 次模型太贵，等 step-3）
  - 锁前 §5.3.2 6 项里缺的按需补（健康检查已含 / env-info 已含 / 两类错误 / loading 状态 / 自解释 —— 当前 1 / 2 / 6 部分齐，3 / 4 / 5 待锁时补）
