# 09-RAG进阶 · 02-Rerank · step-2

## 跑入口

```bash
cd apps && yarn app:09-02-rerank-step-2
```

浏览器：`http://127.0.0.1:50093/`

## 端口

`50093`（apps/README.md 占用表、package.json yarn 脚本、`runtime-ctx` default、该条 README 四处一致）。

## 数据流

```text
浏览器
  ├─ 健康检查 → GET /health
  ├─ 知识库列表（可选） → GET /api/corpus
  ├─ ① 跑粗召回 → POST /api/search-recall
  │     └─ lib/flow/recall.ts（向量 + BM25 + RRF）
  ├─ ② 跑神经精排 → POST /api/rerank
  │     └─ lib/flow/rerank.ts（真调大模型按"问句+文档"成对打分）
  └─ ③ 跑业务加权 → POST /api/rerank-business
        └─ lib/flow/rerank-business.ts（本步核心 · 纯本地计算）
              ├─ 取每张候选的 updatedAt（从 CORPUS 查）
              ├─ 按 businessWeight.on 决定是否启用
              ├─ 每张候选 businessBonus = (距今 ≤ recentDays) ? bonus : 0
              ├─ 综合分 finalScore = rerankScore + businessBonus
              └─ 按 finalScore 降序排 + 赋 rank + 记 previousRank（神经精排原名次）
```

## 页面导航

```text
/                            ← 唯一一页：三阶段对照 + 业务加权配置
```

单页 demo、同端口 50093、三次请求串联：粗召回 → 神经精排 → 业务加权。

## 当前能做什么

- **同一问句三次请求**：第一次 = 粗召回（向量 + BM25 + RRF）；第二次 = 神经精排（真调大模型按"问句 + 文档"成对打分）；第三次 = 业务加权（按 updatedAt 加权 · 纯本地计算）。
- **三榜并排**：上排 = 粗召回 vs 神经精排；下排 = 神经精排 vs 业务加权。每行显示 rerankScore / businessBonus / finalScore 与「名次变化」徽标。
- **业务权重配置可调**：
  - `启用业务加权` 复选框（关闭 = 等同神经精排榜）
  - `近 N 天` 数字输入（窗口大小）
  - `加权分 bonus` 数字输入（神经分之外的额外分）
- **名次变化来源可视化**：第三栏每条候选显示「神经分 + bonus = 综合分」与「原 #X → 新 #Y」徽标，关掉开关时变化消失。

## 对应学习沉淀

- 概念：[docs/学习模块/09-RAG进阶/02-Rerank.md](../../../docs/学习模块/09-RAG进阶/02-Rerank.md)
- 本步对应需求：需求 9 · 业务加权和神经精排能拆开（变体 11）
- 教学点：
  - 业务加权 = 规则（这里是「近 N 天编辑过」），不是神经精排那种模型读问句和正文
  - 两条信号源可独立开关：业务加权关闭时最终榜 = 神经精排榜
  - 名次变化的来源能拆开看：神经分没动，变化完全来自业务规则

## 局限

- 本步只演示一种业务加权规则（按 updatedAt 距今 + bonus）；其他典型规则（新品置顶 / 类目加权 / 关键词命中加权）教学点同形，代码位置略改。
- 业务加权是「粗粒度规则」，不是特征工程意义上的"模型打分"。本步不讲「业务特征 × 神经分怎么校准」。
- 失败归因 ③（材料在 K 生成仍错）本步不调生成，留到能调生成的小节讲。
- 列表式 / 对式 vs 点式（需求 8）不在本步，留到后续 step。