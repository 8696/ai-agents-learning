# 模块 11 · 02 Checkpoint / Durable Resume · step-2：二页一口

## 怎么跑

```bash
cd apps && yarn app:11-02-checkpoint-durable-resume-step-2
```

- 端口：`50122`
- 浏览器：<http://127.0.0.1:50122/>
- 需要密钥：否。本地计算，不调大模型。
- 数据目录：`data/checkpoints/` `data/payment-ledger.json` 起步为空（不复用 step-1 的真实痕迹）。

页面：

- `/` step-2 总览（指向上面两个新 page）
- `/pages/next-run.html` 终态开新业务（变体 F · 做法 1/2 + parentRunId）
- `/pages/memory-vs-disk.html` 内存 vs 磁盘对照（变体 B）

step-1 那六页（写入检查点 / 不可序列化 / 从磁盘恢复 / 扣款后还没写成 / 两单编号隔离 / 快照历史）请回端口 50121 看，不在 step-2 复刻。

## 数据流

```text
终态开新业务（变体 F）
  POST /api/run/start → 第一件 runId
  POST /api/run/step → 走到 okEnd
  POST /api/run/next 携带 previousRunId = 第一件
  → lib/flow/next-run.ts:nextRun 读上一件磁盘检查点、isTerminal 判定
  → 调 startRun(drinkName) + 挂 parentRunId

内存 vs 磁盘（变体 B）
  左:POST /api/run/start → POST /api/run/step-in-memory
    → lib/flow/step-in-memory-only.ts:stepOnceInMemoryOnly
    → 只更新 runs Map，**不**调 writeCheckpoint
  右:POST /api/run/start → POST /api/run/step
    → 正常走一步 + 写盘
  两端都 POST /api/run/forget → 同进程模拟进程没了
  → 左 inMemory=false + 磁盘**没**有；右 inMemory=false + 磁盘**有**
```

## 当前能做什么

- 看到上一件走到 okEnd 后，开下一件时上一件 runId 被挂到 parentRunId
- 反例：在第一件还没走完时点「开下一件」→ HTTP 400 · NEXT_RUN_BEFORE_DONE
- 左右并排看到「只放 Map」vs「真写磁盘」的差别：清空内存后左丢右存

## 对应学习写入小节文档

[docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md](../../../docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md)
