# 模块 11 · 02 Checkpoint / Durable Resume · step-6：二页一口

## 怎么跑

```bash
cd apps && yarn app:11-02-checkpoint-durable-resume-step-6
```

- 端口：`50126`
- 浏览器：<http://127.0.0.1:50126/>
- 需要密钥：否。本地计算，不调大模型。
- 数据目录：`data/checkpoints/` 起步为空（不复用 step-1 / step-2 / step-3 / step-4 / step-5 的真实痕迹）。

页面：

- `/` step-6 总览（指向上面一个新 page）
- `/pages/shipping-refund.html` 业务例子图（变体 F 收口 · 订单发货判断 + 退款）

step-1 / step-2 / step-3 / step-4 / step-5 那几页（端口 50121 / 50122 / 50123 / 50124 / 50125）不在这里复刻。

## 数据流

```text
业务例子图（变体 F 收口）
  POST /api/run/shipping-refund/start 携带 orderId
    → lib/flow/shipping-refund-graph.ts:startSRRun 在内存里建一件任务运行
    → 不调存档器（本步只演示同图同 runId 判定，不演示持久化）
  POST /api/run/shipping-refund/step 携带 runId
    → lib/flow/shipping-refund-graph.ts:stepOnceSR 跑当前节点
    → fetchOrder / checkShipment / noop / refund / done
    → checkShipment 路由看 isShipped 选 noop（已发货）或 refund（未发货）
    → 合并 patch、写 currentNode、**不**调 writeCheckpoint
```

## 当前能做什么

- 用同一张图演示「if/那么」一次性业务（State 共享、终态一致 = 同一份 runId 走完）
- 区分三种边界:同图同 runId / 上一件到 done 后新业务 = 新 runId / 长流程多步表单 = 同一 runId

## 对应学习写入小节文档

[docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md](../../../docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md)
