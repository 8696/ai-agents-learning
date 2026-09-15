# 写入策略 · 第四步（把关：内容维度 C「值不值得占存储」一道闸门）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-4
```

浏览器打开：http://127.0.0.1:50107/

端口：`50107`（yarn 脚本 inline `PORT=50107`；`lib/http/runtime-ctx.ts` `.default(50107)` 兜底）

## 数据流

```text
用户在页面写一段对话原文（或点例句按钮）
    → 调阈值滑块 + 维度 A 开关 + 维度 B 开关 + 维度 C 开关（默认都开）
    → 点「提取并把关」POST /api/filter-dimensions 携带 { text, threshold, enableA, enableB, enableC }
    → 服务端走三道闸门 + 维度 C：
          ① extractFacts：原文 → 0~N 条候选（沿用 step-1）
          ② filterByConfidence：按阈值过滤，达不到的标 BELOW_THRESHOLD
          ③ filterByContentDimensions：让模型给过置信度的候选判
                维度 A（isFact）+ 维度 B（isCrossSession）+ 维度 C（isStorageWorth）
                任一不过 → 标 PROGRAMMATIC_RULE / SESSION_ONLY / PUBLIC_KNOWLEDGE
    → 页面输出分五栏：
          · 通过（绿卡）
          · 置信度拦下（黄卡 · BELOW_THRESHOLD）
          · 维度 A 拦下（橙卡 · PROGRAMMATIC_RULE）
          · 维度 B 拦下（红卡 · SESSION_ONLY）
          · 维度 C 拦下（紫卡 · PUBLIC_KNOWLEDGE）
    → 仍保留 /api/extract 和 /api/filter 作对照基线
```

## 当前能做什么

- 输入一段对话原文，调四个开关（阈值 + 维度 A / B / C），点「提取并把关」看每条候选被哪一道闸门拦下
- 例句里有专门给维度 C 用的「北京是首都」（公开常识，该走 RAG 不进个人库）
- 关掉维度 C 再点同一条：会放行进库，对照「这一刀切掉了什么」
- 三个维度都是同一种模式（让模型判语义），区别只在拒绝原因字符串
- 仍保留 step-1 的「只提取」和 step-2 的「只把关（置信度）」按钮作对照基线
