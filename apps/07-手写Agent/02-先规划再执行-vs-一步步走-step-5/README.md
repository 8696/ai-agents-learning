# 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-5 变体 E 演示

> step-5 状态：**🔄 打磨中**（2026-09-10）。基于锁定的 step-3 完整复制（§5.3.14 增量构建）。**sketch**：仍不要求 §5.3.2 6 项齐。学习者主动锁定那一刻才校验。

## 端口

`50057`

## 跑入口

```bash
cd apps && yarn app:07-02-plan-vs-step-step-5
```

浏览器：[http://127.0.0.1:50057/](http://127.0.0.1:50057/)

## step-5 相对 step-3 的增量

| 维度 | step-3 | step-5 |
| ---- | ------ | ------ |
| mock 工具 | 全部正常 | **write_copy 第 1 次调用强制失败** → `{ok:false, error: 'mock 系统挂了'}`（变体 E 演示）|
| shouldReplan | 看 `query_stock 0 库存` | **不变**（看 available === 0，不看 ok=false）—— 暴露变体 E 缺口 |
| executeTrace | 每步含 `index / step / result / costMs / planVersion` | 不变（result.ok 字段已能区分成功 / 失败）|
| 对照卡 | 4 行（modelCalls / preActSteps / planExists / replannerTriggered）| **5 行**：新增「变体 E 触发」卡（工具失败次数 / 已重规划）|
| 执行卡 | 失败步变红 | 失败步**变橙 + 顶部黄标**「⚠ 变体 E 触发：工具失败，但 shouldReplan 不看 ok=false → 未重规划 → 按旧清单继续做错」|
| 端口 | 50055 | **50057** |

## 数据流

```text
浏览器点「跑左栏」或「跑右栏」或「同时对照」
  │
  ├─ GET /api/step-by-step     → runStepByStep
  └─ GET /api/plan-and-execute → runPlanAndExecute
        ├─ resetFailCounters()（每次右栏请求从 0 计，保证第 1 次 write_copy 失败）
        ├─ doPlan(1) + 执行 + shouldReplan（不看 ok=false）
        └─ FAIL_ON_CALL.write_copy=1 命中 → {ok:false} → 标黄变体 E，不重规划
  │
  ▼
两侧各自返回 JSON；对照数字（含 toolFailures / variantETriggered）由浏览器现场算
```

## 当前能做什么

- 点「跑左栏 / 跑右栏 / 同时对照」→ 两侧各发各的请求
- 顶部对照卡 5 行（含变体 E）
- 右栏执行卡：变体 C 触发时（query_stock 0 库存）重规划 → plans v1 → v2；变体 E 触发时（write_copy 失败）工具失败步变橙 + 顶部黄标「未重规划」
- 最终答案：notify_ops 的 message 内容是「文案已完成」（假数据，SKU-88 实际失败）

## step-5 教学点

- **本条 step-5 增量**：变体 E「过期仍执行」缺口演示
- **对照 step-3 的变化**：
  - mock 工具可强制失败（演示现实世界的工具异常）
  - shouldReplan **没改**（故意）—— 暴露变体 E 缺口
  - UI 加变体 E 黄标 + 对照卡新增字段
- **缺口是教学价值**：演示「工具失败 vs 数据变化是两种世界变了 → 需要不同重规划策略」
- **不在 step-5**（后续 step 或更大模块）：
  - 失败分级（数据错 / 系统错 / 暂时错 → 不同处理）
  - 重试机制
  - 完整 Agent 框架（模块 13+）

## 对应学习沉淀

[docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md](../../../docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md)

## 下一步

- 学习者主动锁定 step-5 → 双方决定 step-6 加什么（按 §5.3.14）：
  - 变体 F 计划给人看（加确认按钮 + 状态机）
  - 锁前 §5.3.2 6 项里缺的按需补
- 全部子条 ✅ 后可走 coach complete 勾本条 ⬜ → ✅
