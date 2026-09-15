# 写入策略 · 第六步（把关：人工确认 / 置信度分档 + 攒起来让用户批量确认）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-6
```

浏览器打开：http://127.0.0.1:50109/

端口：`50109`（yarn 脚本 inline `PORT=50109`；`lib/http/runtime-ctx.ts` `.default(50109)` 兜底）

## 数据流

```text
用户在页面写一段对话原文（或点例句按钮）
    → 调阈值滑块 + 两个分档阈值（highThreshold / midThreshold，默认 0.8 / 0.5）+ 维度开关
    → 点「提取并把关」POST /api/filter-dimensions 携带上述全部参数
    → 服务端走六道闸门：
          ① extractFacts：原文 → 0~N 条候选
          ② filterByConfidence：按 midThreshold 过滤（达不到的标 BELOW_THRESHOLD）
          ③ filterByContentDimensions：让模型判维度 A / B / C / PII
          ④ splitByConfidence：按 highThreshold / midThreshold 把剩余候选分三档
                · 高（≥ highThreshold）：自动通过
                · 中（midThreshold ≤ conf < highThreshold）：攒进 pendingConfirmation
                · 低：已被第 ② 步拦下，不进这步
    → 页面输出分四块：
          · 高档自动通过（绿卡 · passed[]）
          · 中档待确认（黄卡 · pendingConfirmation[]，每条有 [记住] / [不用] 按钮）
          · 置信度拦下（黄底 + 灰字 · rejectedByThreshold[]）
          · 维度拦下（玫红 / 橙 / 红 / 紫四色 · rejectedByDimension[]）
    → 用户在「待确认」区点 [记住] / [不用] → POST /api/confirm body { verdictId, action }
    → 服务端把对应 verdict 从 pendingConfirmation 移到 passed 或丢弃（内存数组模拟，生产再换 SQLite 持久化）
    → 仍保留 /api/extract 和 /api/filter 作对照基线
```

## 当前能做什么

- 输入一段对话原文，调两个分档阈值滑块，点「提取并把关」看候选被分到哪一档
- 例句里有专门给中档用的「我应该是用 Vue 吧，最近有点乱」（confidence 大概 0.6~0.8，进中档「待确认」区）
- 「待确认」区里每条候选一张卡片 + [记住] / [不用] 按钮
- 点 [记住] → 该候选从「待确认」移到「自动通过」（绿卡）+ 服务端记一条审计日志
- 点 [不用] → 该候选直接从「待确认」移除（不进库）
- 调 highThreshold 从 0.8 拉到 0.5 → 中档变高档，原来进「待确认」的会移到「自动通过」，直观对比分档阈值怎么切

## 当前未做

- **攒起来的状态在内存里**：重启服务就清空。生产系统应该用 SQLite（§5.3.17 通用 KV 抽象）持久化，留到 step-(N+1) 做事实库时一起处理
- **没有「批量确认」入口**：当前每条单独点 [记住] / [不用]。批量入口需要设置页，留给后续