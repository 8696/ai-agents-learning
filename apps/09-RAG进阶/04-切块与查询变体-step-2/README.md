# 切块与查询变体 · 第二步（多路查询）

对应学习笔记：[docs/学习模块/09-RAG进阶/04-切块与查询变体.md](../../docs/学习模块/09-RAG进阶/04-切块与查询变体.md)
（先看 step-1 的「父子切块」基础，本步复用其索引与同父去重。）

## 现在怎么跑

```bash
cd apps
yarn app:09-04-chunk-query-variants-step-2
```

浏览器打开：http://127.0.0.1:50099/

端口：`50099`（yarn 脚本 inline `PORT=50099`；`lib/http/runtime-ctx.ts` `.default(50099)` 兜底）

## 数据流

```text
页面加载 GET /api/corpus + GET /api/index-status
    → 顶部「向量库状态」卡 + 「父子树」展示

用户点「多路查询」POST /api/multi-query
    → 模型一次生成 N 条检索问句变体（chat completions，temperature=0.3）
    → 每条问句算 embedding（一次 fetchEmbeddings 拿到 N 个向量）
    → 每条问句各自在已建好的向量库上跑余弦相似度排序，取前 K 条
    → RRF（Reciprocal Rank Fusion）合并：rrfScore(d) = Σ 1 / (60 + rank_in_route)
    → 按 parentId 去重，取父块
    → 调对话补全（第 2 次模型调用）→ 答复

页面输出：
    ① N 条问句变体（Query Variants）
    ② 每条问句自己的命中名单（每路独立）
    ③ RRF 合并后的全 6 条覆盖（带 RRF 分数）
    ④ 去重后的父块
    ⑤ 模型答复
```

## 当前能做什么

- 看见「一条原句 → N 条检索问句变体」的拆解
- 每条变体各自的命中名单（每路独立）
- RRF 合并如何把被多路共同命中的切块往上抬
- 同父去重后喂给模型的父块
- 模型答复
- 空问句 → 4xx；无密钥 → 503

## 跟 step-1 的区别

| | step-1（父子切块） | step-2（多路查询） |
| -- | | | |
| 问句处理 | 1 条原句 | 模型生成 N 条不同说法的检索问句变体 |
| 检索次数 | 1 次 | N 次（每条变体 1 次） |
| 合并 | 不需要 | RRF（倒数排名融合） |
| 模型调用 | 1 次（对话补全） | **2 次**（先生成变体，再生成答复） |
| 适用 | 检索单位 ≠ 生成单位 | 一条问句只覆盖一个语义邻域 |