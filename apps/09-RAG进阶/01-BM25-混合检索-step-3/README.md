# 09-RAG进阶 · 01-BM25-混合检索 · step-3

## 跑入口

```bash
cd apps && yarn app:09-01-bm25-hybrid-step-3
```

浏览器：`http://127.0.0.1:50089/`

## 端口

`50089`（apps/README.md 占用表、package.json yarn 脚本、`runtime-ctx.ts` `.default()`、本 README 四处一致；本步不复制到别处）。

## 数据流

```text
浏览器输入问句
   ├─ 点「跑向量检索」→ POST /api/search-vector（沿用 step-1）
   ├─ 点「跑 BM25」→ POST /api/search-bm25（沿用 step-1）
   ├─ 点「跑加权」→ POST /api/search-hybrid（沿用 step-2 · α 滑块）
   ├─ 点「跑 RRF」→ POST /api/search-rrf（step-3 新增 · 不对齐量纲）
   │     └─ routes/search-rrf → lib/flow/rrf.searchRrf
   │         ├─ 并行两侧 Top-N=20
   │         ├─ RRF 按名次投票：score = Σ 1/(k + rank)
   │         └─ 排序 → Top-K → 返回 rows（含 rank / rrfScore）
   └─ 点「跑偏置」→ POST /api/search-bias（step-3 新增 · 按问句自动 α）
         └─ routes/search-bias → lib/flow/alpha-bias.detectAlpha
             ├─ 正则 `/[A-Z]+[-_]?\d+/` 检测编号模式
             ├─ 分类：纯编号 / 纯口语 / 两者都有
             └─ 返回 { detected, suggestedAlpha, reason, query }
```

## 当前能做什么（step-3 在 step-2 基础上加的）

- **RRF（Reciprocal Rank Fusion，倒数排名融合，变体 6）**：不看分数只看名次。`score = Σ 1/(k + rank)`。**不用对齐量纲**——绕过「余弦 0~1 vs BM25 0~几十」的坑。
- **按问句偏置权重（变体 7）**：正则检测 `/[A-Z]+[-_]?\d+/` 模式 → 编号问 → 建议 α 小（如 0.2）；纯口语 → 建议 α 大（如 0.8）；两者都有 → 中（0.5）。
- **RRF vs 加权对照**：#output 区加一张「RRF vs 加权排名对照」卡，跑两次（一次加权一次 RRF）→ 看排名差异。
- **偏置演示卡**：#output 区加一张「按问句偏置」自动检测卡，跑一次显示「检测结果 + 建议 α + 触发原因」。
- **失败可读**：4xx（k 越界 / 正则错 / JSON 错）+ 5xx。

## 对应学习沉淀

- 概念：[docs/学习模块/09-RAG进阶/01-BM25-混合检索.md](../../docs/学习模块/09-RAG进阶/01-BM25-混合检索.md)
- 进度表：模块 09 README「小节进度」第 1 条；本步覆盖需求 6 + 7（变体 6 + 7）。

## 局限（step-3 边界）

- **覆盖变体 6 + 7**：RRF + 按问句偏置。
- **变体 8（切词对照）** → step-4。