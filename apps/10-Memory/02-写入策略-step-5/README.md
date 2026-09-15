# 写入策略 · 第五步（把关：敏感信息过滤 / 个人身份信息 PII）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-5
```

浏览器打开：http://127.0.0.1:50108/

端口：`50108`（yarn 脚本 inline `PORT=50108`；`lib/http/runtime-ctx.ts` `.default(50108)` 兜底）

## 数据流

```text
用户在页面写一段对话原文（或点例句按钮）
    → 调阈值滑块 + 四个维度开关（A / B / C / PII，默认都开）
    → 点「提取并把关」POST /api/filter-dimensions 携带 { text, threshold, enableA, enableB, enableC, enablePii }
    → 服务端走五道闸门（其中两道调模型）：
          ① extractFacts：原文 → 0~N 条候选（沿用 step-1）
          ② filterByConfidence：按阈值过滤，达不到的标 BELOW_THRESHOLD
          ③ filterByContentDimensions：让模型给过置信度的候选一次性判四道
                · isFact（维度 A：是不是个人事实）
                · isCrossSession（维度 B：跨会话还有用吗）
                · isStorageWorth（维度 C：值不值得占存储）
                · isPii（维度 P：是不是敏感信息 / 个人身份信息）
                优先级 PII > A > B > C，任一不过即拦下
                拦下原因字符串：PII_DETECTED / PROGRAMMATIC_RULE / SESSION_ONLY / PUBLIC_KNOWLEDGE
    → 页面输出分六栏：
          · 通过（绿卡）
          · 置信度拦下（黄卡 · BELOW_THRESHOLD）
          · PII 拦下（玫红卡 · PII_DETECTED）← 新加
          · 维度 A 拦下（橙卡 · PROGRAMMATIC_RULE）
          · 维度 B 拦下（红卡 · SESSION_ONLY）
          · 维度 C 拦下（紫卡 · PUBLIC_KNOWLEDGE）
    → 仍保留 /api/extract 和 /api/filter 作对照基线
```

## 当前能做什么

- 输入一段对话原文，调四个维度开关，点「提取并把关」看每条候选被哪一道闸门拦下
- 例句里有专门给维度 P 用的「我的身份证号是 110101199001011234」「我有糖尿病」「我住在北京市朝阳区」
- PII 这一刀合并进现有的那一次模型调用（不加新调用），让模型在同一个 judgment 里给出四个标签 + reasoning
- 关闭 PII 再点同一条：放行进库，对照「这一刀切掉了什么」
- 仍保留 step-1 的「只提取」和 step-2 的「只把关（置信度）」按钮作对照基线
