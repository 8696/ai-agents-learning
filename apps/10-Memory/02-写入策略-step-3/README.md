# 写入策略 · 第三步（把关：内容维度 A + B 两道闸门）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-3
```

浏览器打开：http://127.0.0.1:50106/

端口：`50106`（yarn 脚本 inline `PORT=50106`；`lib/http/runtime-ctx.ts` `.default(50106)` 兜底）

## 数据流

```text
用户在页面写一段对话原文（或点例句按钮）
    → 调阈值滑块 + 维度 A 开关 + 维度 B 开关（默认两个都开）
    → 点「提取并把关」POST /api/filter-dimensions 携带 { text, threshold, enableA, enableB }
    → 服务端走三道闸门：
          ① extractFacts：原文 → 0~N 条候选（沿用 step-1）
          ② filterByConfidence：按阈值过滤，达不到的标 BELOW_THRESHOLD
          ③ filterByContentDimensions：把过置信度阈值的候选交给模型，让模型判每条的
                isFact（维度 A：是不是个人事实，不是全员规则？）
                isCrossSession（维度 B：跨会话还有用吗，不是本轮临时状态？）
                任一不过 → 标 PROGRAMMATIC_RULE / SESSION_ONLY
    → 页面输出分四栏：
          · 通过（绿卡，三道闸门全过）
          · 置信度拦下（黄卡，BELOW_THRESHOLD）
          · 维度 A 拦下（橙卡，PROGRAMMATIC_RULE）
          · 维度 B 拦下（红卡，SESSION_ONLY）
    → 仍保留 /api/extract 和 /api/filter 作对照基线
```

## 当前能做什么

- 输入一段对话原文，调维度 A / B 开关（默认都开），点「提取并把关」看每条候选被哪一道闸门拦下
- 关掉维度 A：候选只过置信度 + 维度 B；关掉维度 B：只过置信度 + 维度 A；两个都关：退回到 step-2 的纯置信度判定
- 例句里有针对维度 A 的「以后表单都用 zod」（全员规则，不是个人事实）和针对维度 B 的「今天有点累」（本轮临时状态，不跨会话）
- 模型给每条候选的判定附上 reasoning（理由一句话），页面上能看到具体为什么拦下
- 仍保留 step-1 的「只提取」和 step-2 的「只把关」按钮作对照基线