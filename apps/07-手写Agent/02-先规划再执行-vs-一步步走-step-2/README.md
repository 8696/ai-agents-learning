# 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-2 真规划器增量

> step-2 状态：**🔄 打磨中**（2026-09-10）。基于锁定的 step-1 完整复制（§5.3.14 增量构建）。**sketch**：仍不要求 §5.3.2 6 项齐。学习者主动锁定那一刻才校验。

## 端口

`50054`

## 跑入口

```bash
cd apps && yarn app:07-02-plan-vs-step-step-2
```

浏览器：[http://127.0.0.1:50054/](http://127.0.0.1:50054/)

## step-2 相对 step-1 的增量

| 维度 | step-1 | step-2 |
| ---- | ------ | ------ |
| A 路径（一步步走） | mock 模型（固定 7 圈） | **真模型循环**（openai.chat.completions.create；每圈模型自选调啥，最多 MAX_ROUNDS=8 圈） |
| B 路径（先规划）规划器 | mock 固定 6 步清单 | 真模型（openai.chat.completions.create，协议 A）；模型吐自然语言步骤 → 代码按行正则解析成 plan 数组 |
| B 路径解析失败 | n/a | **回退 mock plan** + 标 `plannerFallback=true`（让前端可见「模型吐不稳」） |
| 缺 Key | 不影响（不调 LLM） | 主按钮 disabled（§5.3.9） |
| /health callsModel | false | true |
| 端口 | 50053 | **50054**（独立口；§5.3.3 撞车 +1） |
| yarn script | `app:07-02-plan-vs-step-step-1` | `app:07-02-plan-vs-step-step-2` |

## 数据流

```text
浏览器点「跑左栏」或「跑右栏」或「同时对照」
  │
  ├─ GET /api/step-by-step     → routes/step-by-step.ts → runStepByStep
  └─ GET /api/plan-and-execute → routes/plan-and-execute.ts → runPlanAndExecute
  │
  ├─ runStepByStep（变体 A · 真模型 ReAct）
  │     └─ 每圈 openai.chat.completions.create + tools → invokeTool → 最多 MAX_ROUNDS=8
  │
  └─ runPlanAndExecute（变体 B · 真规划器）
        ├─ planWithLlm(task)  真调一次模型
        │    ├─ system prompt：让模型吐「步骤 N：tool(args) · 理由」自然语言列表
        │    ├─ openai.chat.completions.create({ messages })
        │    ├─ 五条日志：调用模型开始/结束 + 完整 messages + 完整 response + __code + 耗时
        │    └─ 剥 think 块 + 按行正则解析 → plan 数组
        ├─ 解析失败 → 回退 FALLBACK_PLAN + plannerFallback=true
        └─ 顺序按 plan 调 mock 工具 → executeTrace + 最终答案
  │
  ▼
两侧各自返回 JSON；对照数字由浏览器用两次结果现场算
```

服务端日志（`logs/YYYY-MM-DD.log`）B 路径每次写：调用模型开始/结束（完整 messages + 完整 response + 字段释义 + 耗时）+ planner 解析失败 warn（如果）+ 解析后 plan + 执行每步五条日志。

## 当前能做什么

- 固定任务：「春季上新：拉库存、给有货 SKU 写文案、通知运营」
- 点「跑左栏 / 跑右栏 / 同时对照」→ 两侧各发各的请求（同时对照 = 浏览器并发两次，不是服务端打包）
- 点「跑右栏」→ B 路径真调一次模型
  - 计划卡右上角标签：「✅ 真模型规划」/「⚠ 兜底 mock」（取决于模型吐的东西能不能解析）
  - 「模型原话」可展开 `<details>`：看模型真吐的自然语言步骤列表
  - 每行解析成 plan 数组 → 渲染成可执行的 6 步
- 缺 Key 时主按钮 disabled（`callsModel && !hasKey`），页脚 `密钥 ❌（未配 Key → 主按钮 disabled）`
- A 路径真模型循环（每圈模型自选调啥，1 ~ MAX_ROUNDS=8 圈都可能）；每次点按钮轨迹可能不一样

## step-2 教学点

- **本条 step-2 增量**：真规划器
- **对照 step-1 的变化**：
  - B 路径「计划这份对象」来自真模型吐的步骤（每次点按钮 plan 可能不一样；只有 plannerFallback 时才回退 mock 清单）
  - 模型吐自然语言步骤列表 → 代码按行正则解析 → 结构化 plan
  - 解析失败兜底：`plannerFallback=true`（让学习者看到「模型吐不稳」的实际情况）
- **不在 step-2**（后续 step 再加）：
  - A 路径真模型（7 圈 Reason 真调）—— 太贵，等 step-3
  - 重规划（变体 C）—— step-3 / 4
  - 短任务不值得规划（变体 D）—— step-3 / 4
  - 计划过期仍执行（变体 E）—— step-4 / 5
  - 计划给人看（变体 F）—— step-5
  - 代价对照（变体 G · 用真实计时）—— step-3

## 对应学习沉淀

[docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md](../../../docs/学习模块/07-手写Agent/02-先规划再执行-vs-一步步走.md)

## 下一步

- 学习者主动锁定 step-2 → 双方决定 step-3 加什么（按 §5.3.14）：
  - **重规划（变体 C）**：B 路径执行某步后看 tool_result，如果发现关键变化（如 SKU 全部 0 库存）→ 重新调 planWithLlm 出新清单，UI 上能看见「计划 v1 → v2」
  - **短任务对照（变体 D）**：让 plan-vs-step 在同一页跑两个 task——「把 todo-001 标完成」（1 步）/「上新 3 件套」（多步），对照「规划是额外成本」
  - **计划给人看（变体 F）**：右栏加「待执行 / 已确认」状态 + 确认按钮，未确认前不调工具
  - 锁前 §5.3.2 6 项里缺的按需补（健康检查已含 / env-info 已含 / 自解释已含；两类错误 / loading 状态 — 当前 3 部分齐，4 / 5 待锁时补）