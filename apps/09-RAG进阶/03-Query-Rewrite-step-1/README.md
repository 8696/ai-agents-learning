# 查询改写 · 第一步（step-1）

对应学习笔记：[查询改写（Query Rewrite）](../../docs/学习模块/09-RAG进阶/03-Query-Rewrite.md)

## 怎么跑

```bash
cd apps
yarn app:09-03-query-rewrite-step-1
```

浏览器打开 `http://127.0.0.1:50095/`

端口：`50095`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表一致）

## 数据流

```text
打开页面
  GET /health                  → 页脚模型服务商 / 模型 / 密钥
  GET /api/corpus              → 8 个切块正文（只存在服务端）
第一步
  POST /api/search-original    → 用户原句词重叠检索（不调模型）
第二步
  POST /api/rewrite-and-search → 协议 A 改写（响应里带回 modelCall：提示词和参数）→ 再用改写句检索
```

## 当前能做什么

- 看见服务端切块，黄边是该引用的「未拆封超过七日特例」
- 原句检索：目标切块通常没进检索名单（词汇鸿沟）
- 改写后再检索：同一 `id` 进检索名单或名次抬升；右栏同时展示发给大模型的提示词（Prompt）、参数、原句和 rewrittenQuery
- 空问句 4xx、演示后端 5xx 两条失败通道

本步工作区，尚未锁定。
