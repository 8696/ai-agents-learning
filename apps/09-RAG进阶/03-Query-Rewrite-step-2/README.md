# 查询改写 · 第二步（step-2） · HyDE 假想文档嵌入

对应学习笔记：[查询改写（Query Rewrite）](../../docs/学习模块/09-RAG进阶/03-Query-Rewrite.md)

## 怎么跑

```bash
cd apps
yarn app:09-03-query-rewrite-step-2
```

浏览器打开 `http://127.0.0.1:50096/`

端口：`50096`（与 `lib/http/runtime-ctx.ts`、`apps/README.md` 占用表一致）

## 数据流

```text
打开页面
  GET /health            → 含 embeddingModel 字段（HyDE 必需；缺则按钮禁用）
  GET /api/corpus        → 8 个切块正文（只存在服务端）
启动服务（listen 回调）
  preEmbedChunks()       → 一次性把 8 个切块嵌入（type=db），缓存到内存
第一步 · 跑 HyDE
  POST /api/hyde-and-search
    → 模型生成「假想政策段」(type=query embed-friendly paragraph)
    → 嵌入假想段 (type=query)
    → cosine vs 预嵌入的 8 个切块 → top-K
第二步 · 跑原句直接嵌入检索（对照）
  POST /api/original-vector-search
    → 原句直接嵌入 (type=query)
    → cosine vs 预嵌入的 8 个切块 → top-K
两条路径各自独立，底部用同一 target.id (unopened-exception) 对照 onTable / rank / cosine
```

## 当前能做什么

- 短问句 / 太瘦问句走 HyDE：模型先写一段"如果知识库有答案，那段大概长这样"的假想政策段，再拿这段嵌入做余弦检索
- 假想段全文展示在左栏 + 模型调用详情（system 写明「检索前的假想文档生成器，不是客服」）
- 对照路径：原句直接嵌入检索
- 同一 id（unopened-exception）对照：HyDE cosine vs 原句 cosine —— 看假想段是不是真的让检索更准
- 空问句 4xx、演示后端 5xx 两条失败通道

## 和 step-1 的差异

| 维度 | step-1（端口 50095）| step-2（端口 50096）|
| --- | --- | --- |
| 检索方式 | 词重叠（不调嵌入）| 向量检索（余弦相似度）|
| 是否调嵌入 | 不调 | 调（预嵌入 + 假想段嵌入）|
| 是否调聊天模型 | 改写时调 1 次 | 假想段生成时调 1 次 |
| 改写 vs 假想段 | 整句换词（改写句检索）| 整段陈述（假想段嵌入检索）|
| 关键词 | 「未拆封 / 七日 / 特例」| 「政策正文风格段落」|

## 本步已锁定（2026-09-14 · 学习者主动声明）。