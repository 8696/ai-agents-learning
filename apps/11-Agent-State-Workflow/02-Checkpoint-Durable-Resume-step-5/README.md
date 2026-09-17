# 模块 11 · 02 Checkpoint / Durable Resume · step-5：二页一口

## 怎么跑

```bash
cd apps && yarn app:11-02-checkpoint-durable-resume-step-5
```

- 端口：`50125`
- 浏览器：<http://127.0.0.1:50125/>
- 需要密钥：否。本地计算，不调大模型。
- 数据目录：`data/checkpoints/` 起步为空（不复用 step-1 / step-2 / step-3 / step-4 的真实痕迹）。

页面：

- `/` step-5 总览（指向上面一个新 page）
- `/pages/node-fail.html` 节点失败 ≠ 进程被杀掉（易混 13）

step-1 / step-2 / step-3 / step-4 那几页（端口 50121 / 50122 / 50123 / 50124）不在这里复刻。

## 数据流

```text
节点失败 ≠ 进程被杀掉（易混 13）
  POST /api/run/start → 生成 runId
  POST /api/run/step → 走到 chargeCard
  POST /api/run/brew-fail 携带 runId
    → lib/flow/brew-fail.ts:setBrewFailFlag 在内存里把 brewFailOnStep 设上
    → 不调节点函数，**不**写磁盘
  POST /api/run/step → 跑到 brewHot 节点
    → lib/flow/cafe-graph.ts:brewHot 看到 brewFailOnStep === true
    → 返回 { brewOk: false, brewNote: "热饮机故障", lastError: "brewHot 节点失败：..." }
    → 路由 routeAfter 看 lastError 非空 → 走 brewFailed 失败边
  → 磁盘上写新检查点（currentNode = brewFailed, lastError 非空）
  进程还在，内存表里还在
  对照:进程被杀掉是另一回事（见 step-1 pages/charge-crash.html + pages/resume.html）
```

## 当前能做什么

- 看到 brewHot 节点函数见 brewFailOnStep 标志时写 lastError、走 brewFailed 失败边
- 进程还在，磁盘上有新检查点

## 对应学习写入小节文档

[docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md](../../../docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md)
