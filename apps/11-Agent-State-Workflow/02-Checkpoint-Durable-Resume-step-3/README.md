# 模块 11 · 02 Checkpoint / Durable Resume · step-3：三页一口

## 怎么跑

```bash
cd apps && yarn app:11-02-checkpoint-durable-resume-step-3
```

- 端口：`50123`
- 浏览器：<http://127.0.0.1:50123/>
- 需要密钥：否。本地计算，不调大模型。
- 数据目录：`data/checkpoints/` 起步为空（不复用 step-1 / step-2 的真实痕迹）。

页面：

- `/` step-3 总览（指向上面两个新 page）
- `/pages/pure-vs-sideeffect.html` 纯计算 vs 扣款对照（变体 M）
- `/pages/half-written.html` 半份文件退回（变体 I · 第四种时机）

step-1 / step-2 那几页（端口 50121 / 50122）不在这里复刻。

## 数据流

```text
纯计算 vs 扣款（变体 M）
  左:POST /api/run/start → POST /api/run/step（走识别饮品 takeOrder/brewHot）
    → 清空内存 POST /api/run/forget → 磁盘恢复 POST /api/run/resume → 再走一步
    → drinkType 不变，支付渠道账本不动
  右:开件 → 走一步到 brewHot → POST /api/run/charge-crash（杀在 chargeCard 中途）
    → 清空内存 → 磁盘恢复 → 再走一步
    → chargeCard 节点再进一次，支付渠道 callCount +1，deductionCount 仍是 1（幂等）

半份文件（变体 I · 第四种时机）
  writeCheckpoint 加 keepHistory 选项
  readCheckpoint 升级:主文件 parse 失败时按编号降序回退到 step-NNNN.json
  POST /api/run/write-half → lib/flow/write-half-file.ts 把 {runId}.json 截断一半
  读 history → 主文件标红 + parseError;历史副本保持完整
  读最新检查点 → 返回 fellBackTo = step-0001.json
```

## 当前能做什么

- 看到左侧「纯计算」重跑结果一致，右侧「有副作用」靠幂等保护
- 故意把主文件截断后，readCheckpoint 自动回退到上一份完整历史副本

## 对应学习写入小节文档

[docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md](../../../docs/学习模块/11-Agent-State-Workflow/02-Checkpoint-Durable-Resume.md)
