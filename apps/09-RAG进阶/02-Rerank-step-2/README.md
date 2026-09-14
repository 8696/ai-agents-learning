# 重排序（Rerank） · 第二步

对应小节：[docs/学习模块/09-RAG进阶/02-Rerank.md](../../../docs/学习模块/09-RAG进阶/02-Rerank.md)

## 怎么跑

```bash
cd apps
yarn app:09-02-rerank-step-2
```

浏览器打开 `http://127.0.0.1:50093/`

端口：`50093`

## 数据流

```text
打开页面（GET /）
  → GET /health（取环境：provider / model / 密钥）
  → GET /api/corpus（服务端 8 个切块原样上页）
  → 选一个 mode 进：

  ① Listwise + id 校验  pages/listwise.html
       POST /api/listwise-llm（一次对话补全 → 校验 orderedIds ⊆ candidateIds）

  ② 接口形状 vs 对话模型  pages/shape-vs-llm.html
       左栏  POST /api/listwise-shape（专用接口形状 mock，无密钥也能跑）
       右栏  POST /api/listwise-llm（对话模型 Listwise）

  ③ Pairwise  pages/pairwise.html
       POST /api/pairwise（一次请求 → winner: "A" | "B"）
```

## 当前能做什么

三个 mode 是第二阶段（精排）的另外三种实现形状 —— 不是同一份 `lib/flow/` 核心，而是独立的主流程。

- **① Listwise + id 校验**：一次把候选摘要拼进 messages，让模型出 `orderedIds`；服务端校验 ⊆ 候选。校验不通过 = 红字 + 缺谁 / 多谁 + 模型原样输出，**不**静默采用。
- **② 接口形状 vs 对话模型**：同问句同名单，左栏走 mock 的「专用重排序接口形状」（`{query, documents[]}` → `{results: [{id, score}]}`），右栏走对话模型 Listwise。请求 / 响应 / 调用次数对照看。
- **③ Pairwise**：选一对预设（A / B 是库里的两条切块），一次请求回 `winner: "A" | "B"` + 一句话理由。**不**出两个 0～1 假装在比。

step-1 已锁定（4 个 mode：正常对照 / 候选窗外 / 关闭精排 / Token 量级），保留在 `apps/09-RAG进阶/02-Rerank-step-1/`，不再回头改。

服务端日志写 `apps/09-RAG进阶/02-Rerank-step-2/logs/{YYYY-MM-DD}.log`，**三个主流程单独成文件**（`lib/flow/{listwise,listwise-shape,pairwise}.ts`），**路由只校验入参**。