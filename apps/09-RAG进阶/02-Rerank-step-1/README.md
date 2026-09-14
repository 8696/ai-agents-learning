# 重排序（Rerank） · 第一步

对应小节：[docs/学习模块/09-RAG进阶/02-Rerank.md](../../../docs/学习模块/09-RAG进阶/02-Rerank.md)

## 怎么跑

```bash
cd apps
yarn app:09-02-rerank-step-1
```

浏览器打开 `http://127.0.0.1:50092/`

端口：`50092`

## 数据流

```text
打开页面（GET /）
  → GET /health（取环境：provider / model / 密钥）
  → GET /api/corpus（服务端 8 个切块原样上页）
  → 选一个 mode 进：

  ① 正常对照  pages/normal.html
       POST /api/recall（limit=6）→ POST /api/rerank（真调模型）

  ② 候选窗外  pages/window-of-shame.html
       POST /api/recall（limit=3）→ POST /api/rerank
       桌面上只有 3 条，特例必掉到窗外 —— 精排怎么改顺序都救不回

  ③ 关闭精排  pages/rerank-off.html
       POST /api/recall（limit=K）→ POST /api/rerank（mode=off，不调模型）
       K = 3 / 5 / 8；分数沿用粗召回分，名次不变

  ④ Token 量级  pages/token-budget.html
       POST /api/token-estimate（本地粗估 text.length / 1.5）
       同问句对照：召回全量 8 条 vs 精排后前 3 条
```

## 当前能做什么

四个 mode 共享同一份 `lib/flow/{recall,rerank}.ts` 核心 + 一个可选入参（`limit` / `mode`）。

- **① 正常对照**：召回 6 条 → 精排改顺序。同一切块从召回第 6 抬到精排第 1。
- **② 候选窗外**：召回窗缩到 3，特例被截到窗外。看见「候选窗救不回」这条边界。
- **③ 关闭精排**：K 选 3 / 5 / 8。关闭后不调模型，分数沿用粗召回分。
- **④ Token 量级**：本地粗估 token 数，看见「少塞 vs 多塞」的量级差。

服务端日志写 `apps/09-RAG进阶/02-Rerank-step-1/logs/{YYYY-MM-DD}.log`，**主流程单独成文件**（`lib/flow/recall.ts` / `lib/flow/rerank.ts`），**路由只校验入参**。
