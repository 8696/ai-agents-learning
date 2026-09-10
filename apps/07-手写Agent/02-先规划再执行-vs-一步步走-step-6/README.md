# 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-6 变体 F 计划给人看

> step-6 状态：**🔄 打磨中**（2026-09-10）。基于锁定的 step-5 完整复制（§5.3.14 增量构建）。**sketch**：仍不要求 §5.3.2 6 项齐。学习者主动锁定那一刻才校验。

## 端口

`50058`

## 跑入口

```bash
cd apps && yarn app:07-02-plan-vs-step-step-6
```

浏览器：[http://127.0.0.1:50058/](http://127.0.0.1:50058/)

## step-6 相对 step-5 的增量

| 维度 | step-5 | step-6 |
| ---- | ------ | ------ |
| 服务端 | 一次性 GET /api/compare → 完整轨迹 | **两阶段**：GET /api/plan（只 plan）+ POST /api/confirm-plan（人点头才执行）；左栏独立 GET /api/step-by-step |
| sessions Map | 不需要 | **按 sessionId 存 plans**（pending 状态的 plan 等用户确认后跑）|
| 状态机 | 无 | `idle → planned → executed`（UI 状态机显式展示）|
| UI 按钮 | 单「跑对照」按钮 | 「开始规划」+ 「✅ 确认执行」两个按钮 |
| UI plan 卡 | 显示 plan + 灰/绿标签 | 加「待确认 · 等你点头」状态标签 + 橙底高亮 |
| UI 执行卡 | 一直显示 | **只有 executed 阶段才显示**（确认前无 executeTrace）|
| 顶部对照卡 | 4 行 + 变体 E | 同 step-5（**只有 executed 才显示**，阶段 1 无 comparison）|
| 端口 | 50057 | **50058** |

## 数据流

```text
左栏（独立，和右栏确认互不绑定）
  └─ GET /api/step-by-step → runStepByStep → 轨迹

右栏阶段 1：点「开始规划」
  └─ GET /api/plan
        ├─ planOnly(task) → 调真规划器 1 次（不 invokeTool）
        ├─ sessions.set(sessionId, { task, initialSteps, rawText, fallback })
        └─ 返回 { sessionId, task, plans: [v1], status: 'pending' }

右栏阶段 2：点「确认执行」
  └─ POST /api/confirm-plan { sessionId }
        ├─ sessions.get(sessionId) → 拿 plans
        ├─ executeFromPlan(...) → 只执行已保存的计划（禁止再跑 A 路径）
        ├─ sessions.delete(sessionId)
        └─ 返回 { plans, executeTrace, status: 'executed' }
```

## 当前能做什么

- 左栏：点「跑一步步走」→ GET /api/step-by-step（和右栏确认互不绑定）
- 右栏阶段 1：点「开始规划」→ GET /api/plan → 看到 plan v1 + 「待确认」+ 「确认执行」按钮（确认前无执行卡）
- 右栏阶段 2：点「确认执行」→ POST /api/confirm-plan → 看到 executeTrace + 最终答案
  - 确认请求**不会**再跑一步步走

## step-6 教学点

- **本条 step-6 增量**：变体 F「计划给人看」两阶段
- **对照 step-5 的变化**：
  - 服务端拆成 planOnly + executeFromPlan（用户点确认前 executeFromPlan 不跑）
  - UI 状态机显式展示（planStage='idle'/'planned'/'executed'）
  - 「确认前无副作用」—— 没点按钮 = 没执行
- **不在 step-6**（后续 step 或更大模块）：
  - 完整 Human-in-the-loop（暂停 / 恢复 / 多轮次确认 / 修改 plan 后再执行）
  - 这部分进模块 11

## 对应学习沉淀

[docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md](../../../docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md)

## 下一步

- 学习者主动锁定 step-6 → 全部 6 个子条 ✅ → 可走 coach complete 勾本条 ⬜ → ✅
