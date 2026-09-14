# 重排序（Rerank） · 第三步

对应小节：[docs/学习模块/09-RAG进阶/02-Rerank.md](../../../docs/学习模块/09-RAG进阶/02-Rerank.md)

## 怎么跑

```bash
cd apps
yarn app:09-02-rerank-step-3
```

浏览器打开 `http://127.0.0.1:50094/`

端口：`50094`

## 数据流

```text
打开页面（GET /）
  → GET /health（取环境：provider / model / 密钥）
  → GET /api/eval-set（取服务端 20 条评测问句 + 标注）
  → 选 pipeline：
      ① 召回 only（recall）
      ② 召回 + Pointwise 精排（recall+pointwise · mock）
      ③ 召回 + Listwise 精排（recall+listwise · mock）
  → 选 K（Top-K：1 / 3 / 5）
  → 点「跑评测」：
       POST /api/eval-run
       服务端跑 20 条 → 算 hit 数 → 返命中率 + 每条详情
```

## 当前能做什么

内置 20 条人工标注问句（每条标了「该引用的切块 id」），同一份评测集跑三种 pipeline，对照**命中率**。

- **召回 only**：仅按粗召回分排，取 Top-K
- **召回 + Pointwise（mock）**：mock 给固定分（特例切块直接 0.95，其他按 coarseScore 排序）
- **召回 + Listwise（mock）**：mock 直接按粗召回分降序出 orderedIds

> 「mock」是教学简化：本步教学点是「评测框架 + 命中率对照」，不是「精排模型」。mock 故意偏向特例，保证召回 vs 精排有清晰对照。**不接真对话模型**避免 20 条 × N 次调用 token / 时间吃紧。

step-1 / step-2 已锁定，保留在 `02-Rerank-step-1/` 和 `02-Rerank-step-2/`，不再回头改。

服务端日志写 `apps/09-RAG进阶/02-Rerank-step-3/logs/{YYYY-MM-DD}.log`，**评测主流程单独成文件**（`lib/flow/eval.ts`），**路由只校验入参**。
