# 09-RAG进阶 · 01-BM25-混合检索 · step-2

## 跑入口

```bash
cd apps && yarn app:09-01-bm25-hybrid-step-2
```

浏览器：`http://127.0.0.1:50088/`

## 端口

`50088`（apps/README.md 占用表、package.json yarn 脚本、`runtime-ctx.ts` `.default()`、本 README 四处一致；本步不复制到别处）。

## 数据流

```text
浏览器输入问句
   ├─ 点「跑向量检索」→ POST /api/search-vector（与 step-1 同样的路径）
   │     └─ routes/search-vector → lib/flow/bm25-vs-vector.searchByVector
   ├─ 点「跑 BM25」→ POST /api/search-bm25（与 step-1 同样的路径）
   │     └─ routes/search-bm25 → lib/flow/bm25-vs-vector.searchByBm25
   └─ 点「跑混合」→ POST /api/search-hybrid（step-2 新增）
         └─ routes/search-hybrid → lib/flow/hybrid-search.searchHybrid
             ├─ Promise.all 两侧（vector Top-N=20 + BM25 Top-N=20）
             ├─ 可选：min-max 归一化（normalize=true）把两把尺子拉到 0~1
             ├─ 加权：score = α × norm(vec) + (1-α) × norm(bm25)
             └─ 排序 → Top-K → 返回 { rows, sources, weights }
```

## 当前能做什么（step-2 在 step-1 基础上加的）

- **混合两边召回再融合**（变体 4）：同一问句同时调两侧，两份名单合并成一份。
- **加权融合 + 拉齐（min-max）**（变体 5）：**「未拉齐 vs 拉齐后」对照**是本步核心教学点——未拉齐时 α 怎么调都像没开向量，拉齐后才有用。
- **α 滑块**（0~1，0 = 全 BM25，1 = 全向量，0.5 = 各半）+ **「拉齐」开关**（normalize=true / false）。
- **三栏对照**：向量侧 + BM25 侧（沿用 step-1）+ **混合栏**（带「来源徽标」：vector / bm25 / both）。
- **失败可读**：4xx（α 越界 / JSON 错）+ 5xx（嵌入接口失败）。
- **环境元信息**：页脚 `#env-info` 来自 `GET /health`。

## 对应学习沉淀

- 概念：[docs/学习模块/09-RAG进阶/01-BM25-混合检索.md](../../docs/学习模块/09-RAG进阶/01-BM25-混合检索.md)
- 进度表：模块 09 README「小节进度」第 1 条；本步覆盖需求 4 + 5（变体 4 + 5）。

## 局限（step-2 边界）

- **覆盖变体 4 + 5**：混合两边召回 + 加权 + 拉齐。
- **变体 6（RRF）+ 7（按问句偏置）** → step-3。
- **变体 8（切词对照）** → step-4。