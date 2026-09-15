# 写入策略 · 第二步（把关：置信度阈值一个开关）

对应学习笔记：[docs/学习模块/10-Memory/02-写入策略.md](../../docs/学习模块/10-Memory/02-写入策略.md)

## 现在怎么跑

```bash
cd apps
yarn app:10-02-write-policy-step-2
```

浏览器打开：http://127.0.0.1:50105/

端口：`50105`（yarn 脚本 inline `PORT=50105`；`lib/http/runtime-ctx.ts` `.default(50105)` 兜底）

## 数据流

```text
用户在页面写一段对话原文（或点例句按钮）+ 调阈值滑块
    → 点「提取并把关」POST /api/filter 携带 { text, threshold }
    → 服务端调 extractFacts 拿到 0~N 条候选（仍走协议 A · JSON Mode）
    → 按 confidence 与 threshold 逐条比较：
          confidence >= threshold  → 通过，写进事实库（PASS）
          confidence <  threshold  → 拦下，原因 = BELOW_THRESHOLD
    → 同时挂出 /api/extract 作对照基线（保留 step-1 的能力，不删）
    → 页面：
        ① 候选清单卡片（每条带 passed/rejectReason + confidence + 阈值）
        ② 「把关前 vs 把关后」对照（绿 = 通过 / 红 = 拦下）
        ③ 完整的模型请求 + 响应（与 step-1 同源，方便复习）
        ④ 历史记录
```

## 当前能做什么

- 输入任意一段对话原文（或点三个例句按钮），调阈值滑块（0.0~1.0），点「提取并把关」看哪些候选被拦下
- 同一个候选在阈值 0.8 时拦下、阈值 0.3 时通过——直观验证「置信度阈值」这一关在把关流程里起的作用
- 拦下理由显式写明 `BELOW_THRESHOLD`，不通过就是不通过，不会偷偷写进库
- 仍保留「只提取 / 不把关」的对照按钮（调 step-1 的 /api/extract），方便看清「把关这一刀切掉了什么」
