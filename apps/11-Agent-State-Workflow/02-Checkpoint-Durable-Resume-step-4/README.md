# 模块 11 · 02 Checkpoint / Durable Resume · step-4：二页一口

## 怎么跑

```bash
cd apps && yarn app:11-02-checkpoint-durable-resume-step-4
```

- 端口：`50124`
- 浏览器：<http://127.0.0.1:50124/>
- 需要密钥：否。本地计算，不调大模型。
- 数据目录：`data/checkpoints/` 起步为空（不复用 step-1 / step-2 / step-3 的真实痕迹）。

页面：

- `/` step-4 总览（指向上面一个新 page）
- `/pages/graph-version.html` 图版本失败可见（变体 J）

step-1 / step-2 / step-3 那几页（端口 50121 / 50122 / 50123）不在这里复刻。

## 数据流

```text
图版本失败可见（变体 J）
  进程内 currentGraphVersion 默认 v1（lib/flow/graph-version.ts）
  POST /api/run/start → 内存里建 runId
  POST /api/run/step 携带 keepHistory=true → CheckpointRecord.graphVersion = v1
  POST /api/run/set-graph-version 携带 version = v2 → 进程内切到 v2
  GET /api/checkpoint/:runId → readCheckpoint 加载时 graphVersion 不一致
    → 抛 GRAPH_VERSION_MISMATCH,CheckpointRecord.checkpointGraphVersion = v1,currentGraphVersion = v2
  反例:不切版本就读 → 正常读回
```

## 当前能做什么

- 看到发版后加载旧检查点时抛 GRAPH_VERSION_MISMATCH,错误卡里显示两个版本号
- 反例:不切版本就读,正常读回

## 对应学习写入小节文档

[docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md](../../../docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md)
