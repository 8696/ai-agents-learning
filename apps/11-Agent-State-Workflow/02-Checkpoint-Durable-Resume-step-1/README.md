# 模块 11 · 02 Checkpoint / Durable Resume · step-1：六页一口

## 怎么跑

```bash
cd apps && yarn app:11-02-checkpoint-durable-resume-step-1
```

- 端口：`50121`
- 浏览器：<http://127.0.0.1:50121/>
- 需要密钥：否。本地计算，不调大模型。

页面：

- `/` 总览
- `/pages/checkpoint.html` 写入检查点（Checkpoint）
- `/pages/serialize.html` 不可序列化（Serialization）：函数 / Map / Date 不能假装写入成功
- `/pages/resume.html` 从磁盘恢复（Durable Resume）
- `/pages/charge-crash.html` 扣款成功但检查点还没写成
- `/pages/two-orders.html` 两单编号隔离：左右两份 runId 互不覆盖
- `/pages/checkpoint-history.html` 快照历史：每走一步留 step-NNNN.json，引擎只加载最新完整份

## 数据流

```text
写入检查点
  POST /api/run/start → POST /api/run/step
  → lib/flow/checkpoint-after-step.ts:stepOnceAndWrite
  → 覆盖写入 data/checkpoints/{runId}.json

不可序列化对照
  POST /api/run/serialize-dirty
  → lib/flow/serialize-roundtrip.ts:tryWriteDirtyCheckpoint
  → stringify 走一圈后拒绝 writeCheckpoint，磁盘上仍是上一份合法快照

从磁盘恢复
  POST /api/run/forget → 只删内存
  POST /api/run/resume → lib/flow/durable-resume.ts:resumeFromDisk
  → 从当时那一站继续，不是 takeOrder

扣款后还没写成
  POST /api/run/charge-crash → lib/flow/charge-crash-before-checkpoint.ts
  → 支付渠道扣款，不写检查点，清空内存
  再 resume + step → 同一幂等键，真实扣款次数仍是 1

两单编号隔离
  POST /api/run/start（左）+ POST /api/run/second（右）
  → 各自起一件任务运行，runId 互不相关
  → 两份检查点落两个文件

快照历史
  POST /api/run/step 携带 keepHistory=true
  → lib/flow/checkpoint-after-step.ts:writeCheckpoint 把 keepHistory 透传
  → 多写一份 data/checkpoints/{runId}/step-NNNN.json
  GET /api/checkpoint-list?runId=...
  → lib/flow/checkpoint-history.ts:listCheckpoints 扫历史目录，逐份 JSON.parse 校验
  → 引擎不重放，只读不写
```

## 当前能做什么

- 看见每走一步磁盘上的 JSON 被覆盖
- 故意塞函数 / Map / Date 时，页面并排看到写入前和 stringify 之后，文件不被覆盖
- 清空内存后再从文件加载，不从点单重新开始
- 钱扣了、检查点还是旧的，恢复会再进扣款节点，支付渠道靠幂等（Idempotency）只扣一次
- 左右开两件任务运行，分别走一步，检查点落两份不同的文件
- 每走一步留一份历史副本，history 页表格按时序列出，损坏的（JSON.parse 失败）会标红
- 引擎只读最新完整份；页面上写明「重放会再进扣款节点」，不提供一键重放按钮
- 点单名称为空是 HTTP 400；内存空了走一步是另一类 HTTP 400

## 对应学习写入小节文档

[docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md](../../../docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md)
